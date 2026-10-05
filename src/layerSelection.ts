import type { Frame, Matrix } from './document.ts';

/** The document currently bounds layers and selections to the same limit. */
export const MAX_SELECTED_LAYERS = 32;
const MAX_TRANSLATION = 16000;
const MATRIX_LIMIT = 1000000;

type LayerSelectionFrame = Pick<Frame, 'layers' | 'active'> & {
  selectedLayerIds?: unknown;
};

/** A rectangle in document coordinates. */
export type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayerTranslation = { x: number; y: number };
export type MeasuredLayerBounds = SelectionBounds & { id: string };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// Frame validation already constrains layer IDs to UUID-shaped stable IDs.
// Keeping this pure helper keyed to membership also makes it useful for
// deterministic unit tests and for imported pre-validation frame objects.
const validSelectionId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 160;

/**
 * Validate a persisted layer selection against the layer IDs in its frame.
 * An empty array is valid: it represents Select > Deselect Layers. The
 * selection is intentionally capped even when called with an untrusted value
 * so malformed drafts cannot create unbounded UI or history state.
 */
export function validSelectedLayerIds(
  value: unknown,
  layerIds: readonly string[],
): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_SELECTED_LAYERS) return false;
  const known = new Set(layerIds);
  return (
    new Set(value).size === value.length &&
    value.every((id) => validSelectionId(id) && known.has(id))
  );
}

/**
 * Return canonical layer IDs for a frame. Legacy frames did not persist a
 * selection and therefore recover the active layer; explicit arrays preserve
 * Deselect Layers. IDs are emitted in stack order for deterministic history,
 * keyboard ranges and bounds calculations.
 */
export function selectedLayerIdsForFrame(frame: LayerSelectionFrame): string[] {
  const layerIds = frame.layers.map((layer) => layer.id);
  const known = new Set(layerIds);
  const raw = frame.selectedLayerIds;
  if (raw === undefined) {
    return known.has(frame.active) ? [frame.active] : [];
  }
  if (!validSelectedLayerIds(raw, layerIds)) {
    // Read paths should fail closed while still allowing a recoverable legacy
    // bookmark to open. Keep only bounded, known, unique IDs and otherwise
    // fall back to the active layer when no explicit valid entry survives.
    const safe = Array.isArray(raw)
      ? [...new Set(raw.filter((id): id is string => validSelectionId(id) && known.has(id)))].slice(
          0,
          MAX_SELECTED_LAYERS,
        )
      : [];
    if (safe.length) return layerIds.filter((id) => safe.includes(id));
    return Array.isArray(raw) && raw.length === 0 && known.has(frame.active)
      ? []
      : known.has(frame.active)
        ? [frame.active]
        : [];
  }
  return layerIds.filter((id) => raw.includes(id));
}

/**
 * Normalize the selection metadata without mutating any layer or frame. This
 * is used at draft boundaries; callers may safely use the returned frame as a
 * new history value.
 */
export function normalizeLayerSelection<T extends LayerSelectionFrame>(
  frame: T,
): T & { selectedLayerIds: string[] } {
  if (
    frame.selectedLayerIds !== undefined &&
    !validSelectedLayerIds(
      frame.selectedLayerIds,
      frame.layers.map((layer) => layer.id),
    )
  )
    throw new Error('Layer selection metadata is invalid');
  return {
    ...frame,
    selectedLayerIds: selectedLayerIdsForFrame(frame),
  } as T & { selectedLayerIds: string[] };
}

function layerOrder(
  frame: LayerSelectionFrame,
  order?: readonly string[],
): string[] {
  const ids = frame.layers.map((layer) => layer.id);
  if (order === undefined) return ids;
  if (
    order.length > MAX_SELECTED_LAYERS ||
    new Set(order).size !== order.length ||
    order.some((id) => !ids.includes(id))
  )
    throw new Error('Layer selection order is invalid');
  // A caller may supply an explicit visible subset, but appending omitted
  // layers makes keyboard range selection total and deterministic.
  return [...order, ...ids.filter((id) => !order.includes(id))];
}

/**
 * Select one layer, or toggle one layer when additive is true. The target
 * becomes active in both cases. A toggle can intentionally produce an empty
 * selection, matching Photoshop's Deselect Layers command.
 */
export function toggleLayerSelection<T extends LayerSelectionFrame>(
  frame: T,
  id: string,
  additive = false,
): T & { selectedLayerIds: string[] } {
  if (!frame.layers.some((layer) => layer.id === id))
    throw new Error('Layer selection target is not in this frame');
  const current = selectedLayerIdsForFrame(frame);
  const selected = additive
    ? current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]
    : [id];
  return normalizeLayerSelection({
    ...frame,
    active: id,
    selectedLayerIds: selected,
  });
}

/**
 * Select the inclusive range from the active layer to id. The optional order
 * is useful for a filtered/visible layer panel; omitted entries are appended
 * in document order so malformed UI subsets cannot make selection nondeterministic.
 */
export function rangeLayerSelection<T extends LayerSelectionFrame>(
  frame: T,
  id: string,
  order?: readonly string[],
): T & { selectedLayerIds: string[] } {
  if (!frame.layers.some((layer) => layer.id === id))
    throw new Error('Layer selection target is not in this frame');
  const ordered = layerOrder(frame, order);
  const anchor = ordered.includes(frame.active)
    ? frame.active
    : selectedLayerIdsForFrame(frame)[0] || id;
  const from = ordered.indexOf(anchor);
  const to = ordered.indexOf(id);
  if (from < 0 || to < 0) throw new Error('Layer selection range is invalid');
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return normalizeLayerSelection({
    ...frame,
    active: id,
    selectedLayerIds: ordered.slice(start, end + 1),
  });
}

function validBounds(value: unknown): value is SelectionBounds {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SelectionBounds>;
  return (
    finite(candidate.x) &&
    finite(candidate.y) &&
    finite(candidate.width) &&
    finite(candidate.height) &&
    candidate.width >= 0 &&
    candidate.height >= 0
  );
}

/** Combine rectangles in a stable, order-independent way. */
export function combineSelectionBounds(
  bounds: readonly SelectionBounds[],
): SelectionBounds | null {
  if (!bounds.length) return null;
  if (bounds.some((item) => !validBounds(item)))
    throw new Error('Layer selection bounds are invalid');
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Combine externally measured painted bounds for the frame's selected layers.
 * Missing bounds are ignored; this lets a UI defer image decoding without
 * making selection state itself unsafe. Use combineSelectionBounds when all
 * bounds are already available.
 */
export function selectedLayerBounds(
  frame: LayerSelectionFrame,
  bounds:
    | Readonly<Record<string, SelectionBounds>>
    | ReadonlyMap<string, SelectionBounds>
    | readonly MeasuredLayerBounds[],
): SelectionBounds | null {
  if (!bounds || typeof bounds !== 'object')
    throw new Error('Layer selection bounds are invalid');
  const selected = selectedLayerIdsForFrame(frame);
  const lookup = (id: string): SelectionBounds | undefined => {
    if (Array.isArray(bounds))
      return bounds.find((item) => item.id === id);
    if (bounds instanceof Map) return bounds.get(id);
    return (bounds as Readonly<Record<string, SelectionBounds>>)[id];
  };
  return combineSelectionBounds(
    selected.flatMap((id) => {
      const value = lookup(id);
      return validBounds(value) ? [value] : [];
    }),
  );
}

function translatedMatrix(matrix: Matrix, delta: LayerTranslation): Matrix {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 6 ||
    matrix.some((value) => !finite(value)) ||
    Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 0.000000000001 ||
    !finite(delta.x) ||
    !finite(delta.y) ||
    Math.abs(delta.x) > MAX_TRANSLATION ||
    Math.abs(delta.y) > MAX_TRANSLATION
  )
    throw new Error('Layer selection translation is invalid');
  const next: Matrix = [
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4] + delta.x,
    matrix[5] + delta.y,
  ];
  if (next.some((value) => Math.abs(value) > MATRIX_LIMIT))
    throw new Error('Layer selection translation exceeds safe limits');
  return next;
}

/** Translate all selected layers while preserving source assets and metadata. */
export function translateSelectedLayers<T extends LayerSelectionFrame>(
  frame: T,
  delta: LayerTranslation,
): T & { selectedLayerIds: string[] } {
  const selected = new Set(selectedLayerIdsForFrame(frame));
  return normalizeLayerSelection({
    ...frame,
    layers: frame.layers.map((layer) =>
      selected.has(layer.id)
        ? { ...layer, matrix: translatedMatrix(layer.matrix, delta) }
        : layer,
    ),
  });
}

export const selectedBounds = combineSelectionBounds;
export const translateLayerSelection = translateSelectedLayers;
