/** Deterministic, non-destructive canvas viewport rotation helpers. */

export const VIEW_ROTATION_LIMIT = 180;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Normalize a viewport angle into the canonical half-open range [-180, 180). */
export function normalizeViewRotation(value: number): number {
  if (!finite(value)) throw new Error('View rotation must be finite');
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  const rounded = Math.round(wrapped * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Return the shortest signed angular delta between two pointer bearings. */
export function rotationDelta(startRadians: number, currentRadians: number): number {
  if (!finite(startRadians) || !finite(currentRadians))
    throw new Error('Pointer bearings must be finite');
  return normalizeViewRotation(((currentRadians - startRadians) * 180) / Math.PI);
}

/** Return a screen-space pan delta, independent of the rotated canvas mapping. */
export function screenPanDelta(
  previousX: number,
  previousY: number,
  currentX: number,
  currentY: number,
): { x: number; y: number } {
  if (![previousX, previousY, currentX, currentY].every(finite))
    throw new Error('Pan coordinates must be finite');
  return { x: currentX - previousX, y: currentY - previousY };
}

export type ViewRect = { left: number; top: number; width: number; height: number };

/**
 * Convert a client-space pointer into unrotated canvas pixels. The canvas is
 * rotated around its layout centre with CSS; offset dimensions therefore keep
 * the pre-transform width/height while the bounding rect supplies its centre.
 */
export function canvasPointFromClient(
  clientX: number,
  clientY: number,
  rect: ViewRect,
  layoutWidth: number,
  layoutHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  rotation: number,
): { x: number; y: number } {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height,
    layoutWidth, layoutHeight, canvasWidth, canvasHeight].every(finite) ||
      rect.width <= 0 || rect.height <= 0 || layoutWidth <= 0 || layoutHeight <= 0 ||
      canvasWidth <= 0 || canvasHeight <= 0)
    throw new Error('Canvas viewport dimensions are invalid');
  const radians = (normalizeViewRotation(rotation) * Math.PI) / 180;
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const cos = Math.cos(-radians);
  const sin = Math.sin(-radians);
  const localX = dx * cos - dy * sin + layoutWidth / 2;
  const localY = dx * sin + dy * cos + layoutHeight / 2;
  return {
    x: (localX * canvasWidth) / layoutWidth,
    y: (localY * canvasHeight) / layoutHeight,
  };
}
