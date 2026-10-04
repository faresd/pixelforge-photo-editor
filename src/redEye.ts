/**
 * Deterministic local red-eye correction.
 *
 * The primitive deliberately works on an immutable RGBA snapshot. It only
 * changes red-dominant pixels inside the requested radial brush bounds and
 * returns a byte mask so the editor can keep the operation undoable. No image
 * bytes leave the browser and alpha/untouched pixels are preserved exactly.
 */

export type RedEyeOptions = {
  width: number;
  height: number;
  x: number;
  y: number;
  radius: number;
  /** Minimum red-over-channel dominance required to classify a pixel. */
  threshold?: number;
  /** Correction strength from 0 (identity) to 1 (full neutralisation). */
  amount?: number;
};

export type RedEyeResult = {
  pixels: Uint8ClampedArray;
  /** Full-canvas alpha mask describing the applied correction. */
  mask: Uint8ClampedArray;
  changed: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
};

const MAX_DIMENSION = 16_000;
const MAX_PIXELS = 16_000_000;
const MAX_RADIUS = 10_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > MAX_DIMENSION ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    throw new Error('Red Eye canvas dimensions are invalid');
}

function assertPixels(
  source: ArrayLike<number>,
  width: number,
  height: number,
): void {
  if (!source || source.length !== width * height * 4)
    throw new Error('Red Eye source must contain RGBA data for every pixel');
  if (!(source instanceof Uint8ClampedArray)) {
    for (let index = 0; index < source.length; index += 1) {
      if (!finite(source[index]) || source[index] < 0 || source[index] > 255)
        throw new Error('Red Eye source contains invalid RGBA channels');
    }
  }
}

function assertPoint(x: number, y: number): void {
  if (!finite(x) || !finite(y)) throw new Error('Red Eye point is invalid');
}

function assertRadius(radius: number): void {
  if (!finite(radius) || radius < 1 || radius > MAX_RADIUS)
    throw new Error('Red Eye radius must be between 1 and 10,000');
}

function assertThreshold(threshold: number): void {
  if (!finite(threshold) || threshold < 0 || threshold > 255)
    throw new Error('Red Eye threshold must be between 0 and 255');
}

function assertAmount(amount: number): void {
  if (!finite(amount) || amount < 0 || amount > 1)
    throw new Error('Red Eye amount must be between 0 and 1');
}

/** Return a bounded radial coverage with a one-pixel soft edge. */
export function redEyeCoverage(distance: number, radius: number): number {
  if (!finite(distance) || !finite(radius) || radius <= 0)
    throw new Error('Red Eye coverage input is invalid');
  if (distance >= radius) return 0;
  const edge = Math.max(1, Math.min(radius * 0.2, 8));
  if (distance <= radius - edge) return 1;
  return clamp((radius - distance) / edge, 0, 1);
}

/**
 * Whether a pixel is plausibly a red-eye highlight. Transparent pixels are
 * ignored and the test is intentionally conservative to avoid changing skin
 * tones or warm artwork.
 */
export function isRedEyePixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  threshold = 36,
): boolean {
  for (const value of [red, green, blue, alpha]) {
    if (!finite(value) || value < 0 || value > 255)
      throw new Error('Red Eye pixel channels are invalid');
  }
  assertThreshold(threshold);
  if (alpha <= 0) return false;
  const base = Math.max(green, blue);
  return red - base >= threshold && red >= green * 1.35 && red >= blue * 1.35;
}

/**
 * Correct red-dominant pixels around a click. The input is never mutated.
 * Correction neutralises red toward the green/blue midpoint, preserving
 * luminance and alpha as far as possible while remaining deterministic.
 */
export function removeRedEye(
  source: ArrayLike<number>,
  options: RedEyeOptions,
): RedEyeResult {
  assertDimensions(options.width, options.height);
  assertPixels(source, options.width, options.height);
  assertPoint(options.x, options.y);
  assertRadius(options.radius);
  const threshold = options.threshold ?? 36;
  const amount = options.amount ?? 1;
  assertThreshold(threshold);
  assertAmount(amount);
  const pixels = Uint8ClampedArray.from(source);
  const mask = new Uint8ClampedArray(options.width * options.height);
  const left = Math.max(
    0,
    Math.min(options.width, Math.floor(options.x - options.radius)),
  );
  const top = Math.max(
    0,
    Math.min(options.height, Math.floor(options.y - options.radius)),
  );
  const right = Math.max(
    0,
    Math.min(options.width, Math.floor(options.x + options.radius) + 1),
  );
  const bottom = Math.max(
    0,
    Math.min(options.height, Math.floor(options.y + options.radius) + 1),
  );
  let changed = false;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const distance = Math.hypot(x - options.x, y - options.y);
      const coverage = redEyeCoverage(distance, options.radius) * amount;
      if (coverage <= 0) continue;
      const offset = (y * options.width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (!isRedEyePixel(red, green, blue, alpha, threshold)) continue;
      const target = Math.round((green + blue) / 2);
      const nextRed = Math.round(red + (target - red) * coverage);
      if (nextRed === red) continue;
      pixels[offset] = clamp(nextRed, 0, 255);
      mask[y * options.width + x] = Math.round(coverage * 255);
      changed = true;
    }
  }
  return { pixels, mask, changed, bounds: { left, top, right, bottom } };
}

export const redEyeLimits = {
  maxDimension: MAX_DIMENSION,
  maxPixels: MAX_PIXELS,
  maxRadius: MAX_RADIUS,
};
