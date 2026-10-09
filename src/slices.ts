import type { SliceRect } from './cropTools.ts';
import type { Matrix } from './document.ts';

export type { SliceRect } from './cropTools.ts';

export const MAX_DOCUMENT_SLICES = 256;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

/** Validate one persisted slice against its containing canvas. */
export function validDocumentSlice(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
): value is SliceRect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SliceRect>;
  return (
    typeof item.id === 'string' && ID_PATTERN.test(item.id) &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120 &&
    Number.isInteger(item.x) && Number(item.x) >= 0 && Number(item.x) < canvasWidth &&
    Number.isInteger(item.y) && Number(item.y) >= 0 && Number(item.y) < canvasHeight &&
    Number.isInteger(item.width) && Number(item.width) >= 1 && Number(item.x) + Number(item.width) <= canvasWidth &&
    Number.isInteger(item.height) && Number(item.height) >= 1 && Number(item.y) + Number(item.height) <= canvasHeight
  );
}

/** Validate bounded, uniquely identified persisted slice metadata. */
export function validDocumentSlices(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
  activeId?: unknown,
): value is SliceRect[] {
  if (!Array.isArray(value) || value.length > MAX_DOCUMENT_SLICES) return false;
  const ids = new Set<string>();
  for (const slice of value) {
    if (!validDocumentSlice(slice, canvasWidth, canvasHeight)) return false;
    if (ids.has(slice.id)) return false;
    ids.add(slice.id);
  }
  return activeId === undefined || (typeof activeId === 'string' && ids.has(activeId));
}

/** Return the topmost persisted slice under a canvas-space point. */
export function sliceAtPoint(
  slices: readonly SliceRect[] | undefined,
  x: number,
  y: number,
): SliceRect | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  for (let index = (slices?.length ?? 0) - 1; index >= 0; index -= 1) {
    const item = slices![index];
    if (x >= item.x && y >= item.y && x < item.x + item.width && y < item.y + item.height)
      return { ...item };
  }
  return undefined;
}

/** Return a cloned, validated collection for safe persistence. */
export function cloneDocumentSlices(slices: readonly SliceRect[] | undefined): SliceRect[] | undefined {
  return slices?.map((slice) => ({ ...slice }));
}

/** Transform a persisted slice to the clipped axis-aligned bounds of a new canvas. */
export function transformDocumentSlice(
  slice: SliceRect,
  matrix: Matrix,
  canvasWidth: number,
  canvasHeight: number,
): SliceRect | undefined {
  const points = [
    [slice.x, slice.y],
    [slice.x + slice.width, slice.y],
    [slice.x, slice.y + slice.height],
    [slice.x + slice.width, slice.y + slice.height],
  ].map(([x, y]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }));
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const right = Math.min(canvasWidth, Math.ceil(Math.max(...points.map((point) => point.x))));
  const bottom = Math.min(canvasHeight, Math.ceil(Math.max(...points.map((point) => point.y))));
  if (right <= left || bottom <= top) return undefined;
  return { ...slice, x: left, y: top, width: right - left, height: bottom - top };
}
