import type { Group, Layer } from './document';

/**
 * Normalize user-entered layer queries without allowing an unbounded string to
 * become part of the editor's searchable state. Search is intentionally local
 * metadata only; it never inspects or uploads raster pixels.
 */
export function normalizeLayerSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 160).toLocaleLowerCase();
}

function tokens(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

/** Return a stable, human-readable metadata index for a layer. */
export function layerSearchText(
  layer: Layer,
  group?: Group,
): string {
  const visibility = layer.visible && group?.visible !== false ? 'visible' : 'hidden';
  const lock = layer.locked || group?.locked ? 'locked' : 'unlocked';
  return [
    layer.name,
    layer.kind,
    visibility,
    lock,
    group?.name || '',
  ]
    .join(' ')
    .toLocaleLowerCase();
}

/**
 * Match every query token against layer metadata. Requiring all tokens keeps
 * searches predictable for queries such as `hidden raster` while retaining
 * forgiving substring matching for names and group labels.
 */
export function layerMatchesSearch(
  layer: Layer,
  group: Group | undefined,
  query: unknown,
): boolean {
  const normalized = normalizeLayerSearchQuery(query);
  if (!normalized) return true;
  const haystack = layerSearchText(layer, group);
  return tokens(normalized).every((token) => haystack.includes(token));
}

/** Filter layers without mutating the frame or changing stack order. */
export function filterLayersBySearch(
  layers: readonly Layer[],
  groups: readonly Group[],
  query: unknown,
): Layer[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  return layers.filter((layer) =>
    layerMatchesSearch(layer, layer.groupId ? groupById.get(layer.groupId) : undefined, query),
  );
}
