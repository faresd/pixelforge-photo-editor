import type { Selection } from './document';

/** Maximum number of named selection snapshots carried by one document. */
export const MAX_SAVED_SELECTIONS = 32;
/** Selection names are metadata; keeping them bounded prevents oversized drafts. */
export const MAX_SAVED_SELECTION_NAME = 160;
/** A named, immutable-in-use selection snapshot. */
export type SavedSelection = {
  id: string;
  name: string;
  selection: Selection;
};
/** Versioned payload suitable for embedding in a document or standalone file. */
export type SavedSelectionBook = {
  version: 1;
  selections: SavedSelection[];
};
export type SelectionBounds = { w: number; h: number };

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHAPES = new Set(['rectangle', 'ellipse', 'polygon']);
const OPERATIONS = new Set(['replace', 'add', 'subtract', 'intersect']);

function finite(value: unknown, min = -Infinity, max = Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function clonePoint(point: { x: number; y: number }) {
  return { x: point.x, y: point.y };
}
function clonePart(part: NonNullable<Selection['parts']>[number]) {
  return {
    shape: part.shape,
    x: part.x,
    y: part.y,
    w: part.w,
    h: part.h,
    operation: part.operation,
    ...(part.points ? { points: part.points.map(clonePoint) } : {}),
  };
}

/**
 * Clone a selection without retaining mutable points/parts/matrix references.
 * This is used on save and load so a later brush gesture cannot mutate history.
 */
export function cloneSelection(selection: Selection): Selection {
  return {
    shape: selection.shape,
    x: selection.x,
    y: selection.y,
    w: selection.w,
    h: selection.h,
    feather: selection.feather,
    inverted: selection.inverted,
    ...(selection.points ? { points: selection.points.map(clonePoint) } : {}),
    ...(selection.parts ? { parts: selection.parts.map(clonePart) } : {}),
    ...(selection.mask ? { mask: selection.mask } : {}),
    ...(selection.matrix ? { matrix: [...selection.matrix] as Selection['matrix'] } : {}),
  };
}

function validatePart(
  part: unknown,
  bounds?: SelectionBounds,
  requireOperation = true,
): part is NonNullable<Selection['parts']>[number] {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
  const value = part as Record<string, unknown>;
  if (
    typeof value.shape !== 'string' ||
    !SHAPES.has(value.shape) ||
    !finite(value.x) ||
    !finite(value.y) ||
    !finite(value.w, Number.EPSILON) ||
    !finite(value.h, Number.EPSILON) ||
    (requireOperation && (typeof value.operation !== 'string' || !OPERATIONS.has(value.operation)))
  ) return false;
  if (bounds && (value.x < 0 || value.y < 0 || value.x + value.w > bounds.w || value.y + value.h > bounds.h)) return false;
  if (value.shape === 'polygon') {
    if (!Array.isArray(value.points) || value.points.length < 3 || value.points.length > 10000) return false;
    if (value.points.some((point) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) return true;
      const p = point as Record<string, unknown>;
      return !finite(p.x) || !finite(p.y) || Boolean(bounds && (p.x < 0 || p.y < 0 || p.x > bounds.w || p.y > bounds.h));
    })) return false;
  } else if (value.points !== undefined) return false;
  return true;
}

/** Validate a selection snapshot before it is saved or imported. */
export function validateSelection(value: unknown, bounds?: SelectionBounds): value is Selection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const selection = value as Record<string, unknown>;
  if (!validatePart({ ...selection, operation: 'replace' }, bounds, false)) return false;
  if (!finite(selection.feather, 0, 1000) || typeof selection.inverted !== 'boolean') return false;
  if (selection.mask !== undefined && (typeof selection.mask !== 'string' || !ID.test(selection.mask))) return false;
  if (selection.matrix !== undefined) {
    if (!Array.isArray(selection.matrix) || selection.matrix.length !== 6 || selection.matrix.some((part) => !finite(part, -1000000, 1000000))) return false;
    const matrix = selection.matrix as number[];
    if (Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 0.000000000001) return false;
  }
  if (selection.parts !== undefined) {
    if (!Array.isArray(selection.parts) || selection.parts.length < 1 || selection.parts.length > 1000) return false;
    if (selection.parts.some((part) => !validatePart(part, bounds))) return false;
  }
  return true;
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > MAX_SAVED_SELECTION_NAME) throw new Error('Selection name must be 1–160 characters.');
  return normalized;
}
function cloneBook(book: SavedSelectionBook): SavedSelectionBook {
  return {
    version: 1,
    selections: book.selections.map((entry) => ({ id: entry.id, name: entry.name, selection: cloneSelection(entry.selection) })),
  };
}
function validateBook(value: unknown, bounds?: SelectionBounds): value is SavedSelectionBook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const book = value as Record<string, unknown>;
  if (book.version !== 1 || !Array.isArray(book.selections) || book.selections.length > MAX_SAVED_SELECTIONS) return false;
  const ids = new Set<string>(), names = new Set<string>();
  return book.selections.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name : '';
    const key = name.toLocaleLowerCase();
    if (typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id) || !name || name.length > MAX_SAVED_SELECTION_NAME || names.has(key) || !validateSelection(item.selection, bounds)) return false;
    ids.add(item.id);
    names.add(key);
    return true;
  });
}

export function emptySavedSelectionBook(): SavedSelectionBook {
  return { version: 1, selections: [] };
}

/** Save a detached named snapshot. Names are unique case-insensitively. */
export function saveSelection(
  book: SavedSelectionBook,
  selection: Selection,
  name: string,
  options: { id?: string; replaceId?: string; bounds?: SelectionBounds } = {},
): SavedSelectionBook {
  if (!validateBook(book, options.bounds) || !validateSelection(selection, options.bounds)) throw new Error('Invalid saved selection book.');
  const normalized = normalizeName(name);
  const next = cloneBook(book);
  const existingIndex = options.replaceId ? next.selections.findIndex((entry) => entry.id === options.replaceId) : -1;
  if (options.replaceId && existingIndex < 0) throw new Error('Saved selection was not found.');
  const duplicate = next.selections.findIndex((entry, index) => entry.name.toLocaleLowerCase() === normalized.toLocaleLowerCase() && index !== existingIndex);
  if (duplicate >= 0) throw new Error('A saved selection already uses that name.');
  if (existingIndex < 0 && next.selections.length >= MAX_SAVED_SELECTIONS) throw new Error('This document already has 32 saved selections.');
  const id = options.id ?? (globalThis.crypto?.randomUUID?.() || `selection-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (!ID.test(id) || (existingIndex < 0 && next.selections.some((entry) => entry.id === id))) throw new Error('Saved selection ID is invalid or already in use.');
  const saved = { id, name: normalized, selection: cloneSelection(selection) };
  if (existingIndex >= 0) next.selections[existingIndex] = saved;
  else next.selections.push(saved);
  return next;
}

export function renameSelection(book: SavedSelectionBook, id: string, name: string): SavedSelectionBook {
  if (!validateBook(book)) throw new Error('Invalid saved selection book.');
  const normalized = normalizeName(name);
  const next = cloneBook(book), entry = next.selections.find((item) => item.id === id);
  if (!entry) throw new Error('Saved selection was not found.');
  if (next.selections.some((item) => item.id !== id && item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) throw new Error('A saved selection already uses that name.');
  entry.name = normalized;
  return next;
}

export function deleteSelection(book: SavedSelectionBook, id: string): SavedSelectionBook {
  if (!validateBook(book)) throw new Error('Invalid saved selection book.');
  if (!book.selections.some((entry) => entry.id === id)) throw new Error('Saved selection was not found.');
  return { version: 1, selections: book.selections.filter((entry) => entry.id !== id).map((entry) => ({ id: entry.id, name: entry.name, selection: cloneSelection(entry.selection) })) };
}

/** Return a detached selection ready to become the current selection. */
export function loadSelection(book: SavedSelectionBook, id: string, bounds?: SelectionBounds): Selection {
  if (!validateBook(book, bounds)) throw new Error('Invalid saved selection book.');
  const entry = book.selections.find((item) => item.id === id);
  if (!entry) throw new Error('Saved selection was not found.');
  return cloneSelection(entry.selection);
}

export function serializeSavedSelections(book: SavedSelectionBook, bounds?: SelectionBounds): string {
  if (!validateBook(book, bounds)) throw new Error('Invalid saved selection book.');
  return JSON.stringify(cloneBook(book));
}

export function parseSavedSelections(input: unknown, bounds?: SelectionBounds): SavedSelectionBook {
  let value: unknown = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { throw new Error('Saved selection file is not valid JSON.'); }
  }
  if (!validateBook(value, bounds)) throw new Error('Saved selection file is not supported.');
  return cloneBook(value);
}

/** IDs of canvas alpha assets referenced by named snapshots, for safe asset GC. */
export function referencedSelectionMasks(book: SavedSelectionBook): string[] {
  if (!validateBook(book)) throw new Error('Invalid saved selection book.');
  return [...new Set(book.selections.map((entry) => entry.selection.mask).filter((id): id is string => Boolean(id)))];
}

/** A Quick Mask keeps selected alpha in memory; persistence should store it as an image asset. */
export type QuickMask = { width: number; height: number; selected: Uint8ClampedArray };
function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height <= 16000000;
}
function checkMask(mask: QuickMask) {
  if (!validDimensions(mask.width, mask.height) || mask.selected.length !== mask.width * mask.height) throw new Error('Quick Mask dimensions or alpha data are invalid.');
}

/** Enter Quick Mask mode from a selection alpha; no selection means the whole canvas is selected. */
export function createQuickMask(width: number, height: number, selected?: ArrayLike<number>): QuickMask {
  if (!validDimensions(width, height)) throw new Error('Quick Mask dimensions are invalid.');
  if (selected && selected.length !== width * height) throw new Error('Quick Mask alpha data has the wrong size.');
  return { width, height, selected: selected ? Uint8ClampedArray.from(selected) : new Uint8ClampedArray(width * height).fill(255) };
}

/** Paint a circular Quick Mask brush. `selected=true` reveals pixels; false masks them out. */
export function paintQuickMask(mask: QuickMask, x: number, y: number, size: number, opacity: number, selected: boolean, hardness = 1): boolean {
  checkMask(mask);
  if (!finite(x) || !finite(y) || !finite(size, 1, 10000) || !finite(opacity, 0, 1) || !finite(hardness, 0, 1)) throw new Error('Quick Mask brush settings are invalid.');
  if (opacity === 0) return false;
  const radius = size / 2, left = Math.max(0, Math.floor(x - radius)), right = Math.min(mask.width - 1, Math.ceil(x + radius));
  const top = Math.max(0, Math.floor(y - radius)), bottom = Math.min(mask.height - 1, Math.ceil(y + radius));
  let changed = false;
  for (let py = top; py <= bottom; py += 1) for (let px = left; px <= right; px += 1) {
    const distance = Math.hypot(px - x, py - y);
    if (distance > radius) continue;
    const edge = radius === 0 ? 1 : Math.max(0, Math.min(1, (radius - distance) / Math.max(0.0001, radius * (1 - hardness || 1))));
    const amount = Math.max(0, Math.min(1, opacity * (hardness >= 1 ? 1 : edge)));
    if (amount === 0) continue;
    const index = py * mask.width + px, before = mask.selected[index], target = selected ? 255 : 0;
    const after = Math.round(before + (target - before) * amount);
    if (after !== before) { mask.selected[index] = after; changed = true; }
  }
  return changed;
}

/** Render the standard red Quick Mask overlay; the selected region remains clear. */
export function quickMaskOverlay(mask: QuickMask, color: [number, number, number] = [255, 0, 0]): Uint8ClampedArray {
  checkMask(mask);
  if (color.length !== 3 || color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error('Quick Mask overlay color is invalid.');
  const output = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.selected.length; i += 1) {
    const offset = i * 4;
    output[offset] = color[0]; output[offset + 1] = color[1]; output[offset + 2] = color[2]; output[offset + 3] = 255 - mask.selected[i];
  }
  return output;
}

/** Build a normal canvas-sized Selection that references a persisted Quick Mask asset. */
export function selectionFromQuickMask(mask: QuickMask, assetId: string): Selection {
  checkMask(mask);
  if (!ID.test(assetId)) throw new Error('Quick Mask asset ID is invalid.');
  return { shape: 'rectangle', x: 0, y: 0, w: mask.width, h: mask.height, feather: 0, inverted: false, mask: assetId };
}
