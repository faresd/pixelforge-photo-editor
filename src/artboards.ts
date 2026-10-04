import type { Matrix } from './document.ts';

/**
 * A named viewport inside the document canvas.
 *
 * Artboards are deliberately metadata-only in this increment: they do not
 * duplicate raster assets or change the composite render. This gives project
 * files a safe, bounded place to retain named export/view rectangles while the
 * isolated multi-canvas renderer is developed.
 */
export type Artboard = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  locked: boolean;
  /** Optional swatch shown by a future artboard viewport; no pixel asset. */
  background?: string;
};

export const MAX_ARTBOARDS = 8;
export const MAX_ARTBOARD_NAME = 120;
export const ARTBOARD_ID = 'artboard';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const colorPattern = /^#[a-f\d]{6}$/i;

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Validate one artboard against its containing frame dimensions. */
export function validArtboard(
  value: unknown,
  frameWidth: number,
  frameHeight: number,
): value is Artboard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<Artboard>;
  return (
    typeof item.id === 'string' && idPattern.test(item.id) &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= MAX_ARTBOARD_NAME &&
    integer(item.x, 0, frameWidth - 1) && integer(item.y, 0, frameHeight - 1) &&
    integer(item.w, 1, frameWidth) && integer(item.h, 1, frameHeight) &&
    Number(item.x) + Number(item.w) <= frameWidth &&
    Number(item.y) + Number(item.h) <= frameHeight &&
    typeof item.visible === 'boolean' && typeof item.locked === 'boolean' &&
    (item.background === undefined || (typeof item.background === 'string' && colorPattern.test(item.background)))
  );
}

/** Validate the bounded named viewport collection and its active pointer. */
export function validArtboards(
  value: unknown,
  frameWidth: number,
  frameHeight: number,
  activeId?: unknown,
): value is Artboard[] {
  if (!Array.isArray(value) || value.length > MAX_ARTBOARDS) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (!validArtboard(item, frameWidth, frameHeight) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return activeId === undefined || (typeof activeId === 'string' && ids.has(activeId));
}

/** Return a deterministic virtual canvas artboard for legacy frames. */
export function effectiveArtboards(
  frameWidth: number,
  frameHeight: number,
  artboards?: Artboard[],
): Artboard[] {
  if (artboards?.length) return artboards.map((item) => ({ ...item }));
  return [{
    id: `${ARTBOARD_ID}-canvas`,
    name: 'Canvas',
    x: 0,
    y: 0,
    w: frameWidth,
    h: frameHeight,
    visible: true,
    locked: true,
  }];
}

export type ArtboardRequest = Partial<Pick<Artboard, 'id' | 'name' | 'x' | 'y' | 'w' | 'h' | 'visible' | 'locked' | 'background'>> &
  Pick<Artboard, 'name' | 'w' | 'h'>;

/** Build a validated viewport record without allocating any pixel buffer. */
export function createArtboard(
  request: ArtboardRequest,
  frameWidth: number,
  frameHeight: number,
): Artboard {
  const item: Artboard = {
    id: request.id || `${ARTBOARD_ID}-${Math.random().toString(36).slice(2, 10)}`,
    name: request.name,
    x: request.x ?? 0,
    y: request.y ?? 0,
    w: request.w,
    h: request.h,
    visible: request.visible ?? true,
    locked: request.locked ?? false,
    ...(request.background ? { background: request.background } : {}),
  };
  if (!validArtboard(item, frameWidth, frameHeight))
    throw new Error('Artboard bounds or metadata are invalid');
  return item;
}

/** Apply an affine frame transform to viewport bounds without touching assets. */
export function transformArtboard(
  artboard: Artboard,
  matrix: Matrix,
  frameWidth: number,
  frameHeight: number,
): Artboard {
  const points = [
    [artboard.x, artboard.y],
    [artboard.x + artboard.w, artboard.y],
    [artboard.x, artboard.y + artboard.h],
    [artboard.x + artboard.w, artboard.y + artboard.h],
  ].map(([x, y]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }));
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const right = Math.min(frameWidth, Math.ceil(Math.max(...points.map((point) => point.x))));
  const bottom = Math.min(frameHeight, Math.ceil(Math.max(...points.map((point) => point.y))));
  if (right <= left || bottom <= top)
    throw new Error('Artboard is outside the transformed canvas');
  return { ...artboard, x: left, y: top, w: right - left, h: bottom - top };
}
