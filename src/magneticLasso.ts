/** Deterministic local edge snapping used by the Magnetic Lasso tool. */

export type MagneticPoint = { x: number; y: number };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validateImage(data: Uint8ClampedArray, width: number, height: number) {
  if (!(data instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height))
    throw new TypeError('Magnetic lasso image is invalid');
  if (width < 1 || height < 1 || width * height > 16_000_000)
    throw new RangeError('Magnetic lasso image is outside supported limits');
  if (data.length !== width * height * 4)
    throw new RangeError('Magnetic lasso image data does not match dimensions');
}

function luminance(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const offset = (sy * width + sx) * 4;
  return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
}

/** Return a bounded Sobel-like edge score at a document coordinate. */
export function magneticEdgeStrength(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  point: MagneticPoint,
): number {
  validateImage(data, width, height);
  if (!finite(point.x) || !finite(point.y)) throw new TypeError('Magnetic lasso point is invalid');
  const x = Math.max(0, Math.min(width - 1, point.x));
  const y = Math.max(0, Math.min(height - 1, point.y));
  const gx =
    -luminance(data, width, height, x - 1, y - 1) -
    2 * luminance(data, width, height, x - 1, y) -
    luminance(data, width, height, x - 1, y + 1) +
    luminance(data, width, height, x + 1, y - 1) +
    2 * luminance(data, width, height, x + 1, y) +
    luminance(data, width, height, x + 1, y + 1);
  const gy =
    -luminance(data, width, height, x - 1, y - 1) -
    2 * luminance(data, width, height, x, y - 1) -
    luminance(data, width, height, x + 1, y - 1) +
    luminance(data, width, height, x - 1, y + 1) +
    2 * luminance(data, width, height, x, y + 1) +
    luminance(data, width, height, x + 1, y + 1);
  return Math.hypot(gx, gy);
}

/**
 * Snap a pointer to the strongest nearby edge. Distance is a small
 * deterministic tie-breaker so a flat region remains stable and does not
 * jump between equally scored pixels.
 */
export function snapMagneticPoint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  point: MagneticPoint,
  radius = 12,
): MagneticPoint {
  validateImage(data, width, height);
  if (!finite(point.x) || !finite(point.y) || !finite(radius) || radius < 1 || radius > 64)
    throw new RangeError('Magnetic lasso snap options are invalid');
  const centerX = Math.max(0, Math.min(width - 1, point.x));
  const centerY = Math.max(0, Math.min(height - 1, point.y));
  const bound = Math.max(1, Math.round(radius));
  let best: MagneticPoint = { x: Math.round(centerX), y: Math.round(centerY) };
  let bestScore = -Infinity;
  for (let y = Math.max(0, Math.floor(centerY - bound)); y <= Math.min(height - 1, Math.ceil(centerY + bound)); y += 1) {
    for (let x = Math.max(0, Math.floor(centerX - bound)); x <= Math.min(width - 1, Math.ceil(centerX + bound)); x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > bound) continue;
      const score = magneticEdgeStrength(data, width, height, { x, y }) - distance * 0.75;
      if (score > bestScore || (score === bestScore && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

export function magneticPathArea(points: readonly MagneticPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const left = points[index], right = points[(index + 1) % points.length];
    area += left.x * right.y - right.x * left.y;
  }
  return Math.abs(area) / 2;
}
