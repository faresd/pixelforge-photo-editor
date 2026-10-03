/**
 * Deterministic, nondestructive Sharpen and Add Noise corrections.
 *
 * The functions in this module operate on a rendered RGBA buffer.  Callers
 * can keep immutable source assets and adjustment metadata in the document,
 * then apply the correction to the temporary render buffer.  Alpha is never
 * changed and fully transparent pixels are left byte-for-byte untouched.
 */

export type SharpenNoise = {
  /** Unsharp-mask strength as a percentage (0-100). */
  sharpen: number;
  /** Integer box radius used to build the unsharp-mask blur (0-8). */
  radius: number;
  /** Per-channel edge threshold below which sharpening is skipped (0-255). */
  threshold: number;
  /** Uniform noise strength as a percentage (0-100). */
  noise: number;
  /** Use one noise value for all three colour channels. */
  monochromatic: boolean;
  /** Stable unsigned 32-bit seed for the procedural noise stream. */
  seed: number;
};

/** Alias that reads naturally at document-adjustment call sites. */
export type SharpenNoiseAdjustments = SharpenNoise;

export const neutralSharpenNoise: SharpenNoise = {
  sharpen: 0,
  radius: 1,
  threshold: 0,
  noise: 0,
  monochromatic: false,
  seed: 0,
};

const MAX_WIDTH = 16000;
const MAX_HEIGHT = 16000;
const MAX_PIXELS = 16000000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Normalize a partial adjustment at the persistence/render boundary.
 *
 * Sliders can briefly produce values outside their displayed range while a
 * pointer is moving.  Clamping here keeps rendering finite and bounded while
 * preserving a complete, JSON-serializable value for a draft.  The two
 * `*Amount` aliases make migration from common UI field names harmless.
 */
export function effectiveSharpenNoise(
  value: Partial<SharpenNoise> | undefined,
): SharpenNoise {
  const source = (value || {}) as Partial<SharpenNoise> & {
    sharpenAmount?: unknown;
    noiseAmount?: unknown;
  };
  const sharpenValue = source.sharpen ?? source.sharpenAmount;
  const noiseValue = source.noise ?? source.noiseAmount;
  const radius = finite(source.radius)
    ? Math.round(clamp(source.radius, 0, 8))
    : neutralSharpenNoise.radius;
  const seed = finite(source.seed)
    ? Math.trunc(source.seed) >>> 0
    : neutralSharpenNoise.seed;
  return {
    sharpen: finite(sharpenValue)
      ? clamp(sharpenValue, 0, 100)
      : neutralSharpenNoise.sharpen,
    radius,
    threshold: finite(source.threshold)
      ? clamp(source.threshold, 0, 255)
      : neutralSharpenNoise.threshold,
    noise: finite(noiseValue)
      ? clamp(noiseValue, 0, 100)
      : neutralSharpenNoise.noise,
    monochromatic:
      typeof source.monochromatic === 'boolean'
        ? source.monochromatic
        : neutralSharpenNoise.monochromatic,
    seed,
  };
}

/** Strictly validate the persisted, complete adjustment shape and bounds. */
export function validSharpenNoise(value: unknown): value is SharpenNoise {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Partial<SharpenNoise>;
  return (
    finite(a.sharpen) &&
    a.sharpen >= 0 &&
    a.sharpen <= 100 &&
    finite(a.radius) &&
    Number.isInteger(a.radius) &&
    a.radius >= 0 &&
    a.radius <= 8 &&
    finite(a.threshold) &&
    a.threshold >= 0 &&
    a.threshold <= 255 &&
    finite(a.noise) &&
    a.noise >= 0 &&
    a.noise <= 100 &&
    typeof a.monochromatic === 'boolean' &&
    finite(a.seed) &&
    Number.isInteger(a.seed) &&
    a.seed >= 0 &&
    a.seed <= 0xffffffff
  );
}

/** True when both corrections are guaranteed to leave pixels unchanged. */
export function isNeutralSharpenNoise(
  value: Partial<SharpenNoise> | undefined,
): boolean {
  const a = effectiveSharpenNoise(value);
  return a.sharpen === 0 && a.noise === 0;
}

function validateDimensions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!(data instanceof Uint8ClampedArray))
    throw new TypeError('Sharpen/noise data must be a Uint8ClampedArray');
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    width > MAX_WIDTH ||
    height < 1 ||
    height > MAX_HEIGHT ||
    width * height > MAX_PIXELS
  )
    throw new RangeError(
      'Sharpen/noise dimensions are outside the supported limits',
    );
  if (data.length !== width * height * 4)
    throw new RangeError('Sharpen/noise data length does not match dimensions');
}

const clampByte = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

/**
 * Apply a bounded box-blur unsharp mask to one colour channel.
 *
 * Horizontal sums and vertical sums make the blur linear in pixel count even
 * at the largest supported radius.  Transparent neighbours do not contribute
 * to the blur, preventing transparent RGB padding from creating halos.
 */
function applySharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sharpen: number,
  radius: number,
  threshold: number,
): void {
  if (sharpen <= 0 || radius <= 0) return;
  const pixels = width * height;
  const horizontal = new Float32Array(pixels);
  const horizontalCount = new Uint8Array(pixels);
  const strength = sharpen / 100;

  for (let channel = 0; channel < 3; channel += 1) {
    // Build horizontal channel sums and the count of nontransparent samples.
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      let left = 0;
      let right = Math.min(width - 1, radius);
      let sum = 0;
      let count = 0;
      for (let x = 0; x <= right; x += 1) {
        const offset = (row + x) * 4;
        if (data[offset + 3] !== 0) {
          sum += data[offset + channel];
          count += 1;
        }
      }
      for (let x = 0; x < width; x += 1) {
        const index = row + x;
        horizontal[index] = sum;
        horizontalCount[index] = count;

        const nextLeft = Math.max(0, x + 1 - radius);
        const nextRight = Math.min(width - 1, x + 1 + radius);
        while (left < nextLeft) {
          const offset = (row + left) * 4;
          if (data[offset + 3] !== 0) {
            sum -= data[offset + channel];
            count -= 1;
          }
          left += 1;
        }
        while (right < nextRight) {
          right += 1;
          const offset = (row + right) * 4;
          if (data[offset + 3] !== 0) {
            sum += data[offset + channel];
            count += 1;
          }
        }
      }
    }

    // Build vertical sums and immediately correct this channel.  Pixels are
    // read from `data` before they are written, while horizontal is already a
    // complete snapshot for this channel.
    for (let x = 0; x < width; x += 1) {
      let top = 0;
      let bottom = Math.min(height - 1, radius);
      let sum = 0;
      let count = 0;
      for (let y = 0; y <= bottom; y += 1) {
        const index = y * width + x;
        sum += horizontal[index];
        count += horizontalCount[index];
      }
      for (let y = 0; y < height; y += 1) {
        const index = y * width + x;
        const offset = index * 4;
        if (data[offset + 3] !== 0 && count > 0) {
          const source = data[offset + channel];
          const blurred = sum / count;
          const difference = source - blurred;
          if (Math.abs(difference) > threshold)
            data[offset + channel] = clampByte(source + difference * strength);
        }

        const nextTop = Math.max(0, y + 1 - radius);
        const nextBottom = Math.min(height - 1, y + 1 + radius);
        while (top < nextTop) {
          const remove = top * width + x;
          sum -= horizontal[remove];
          count -= horizontalCount[remove];
          top += 1;
        }
        while (bottom < nextBottom) {
          bottom += 1;
          const add = bottom * width + x;
          sum += horizontal[add];
          count += horizontalCount[add];
        }
      }
    }
  }
}

/** Mix a stable integer into a 32-bit hash without mutable global PRNG state. */
function hashNoise(seed: number, pixel: number, channel: number): number {
  let value =
    (seed ^
      Math.imul(pixel + 1, 0x9e3779b9) ^
      Math.imul(channel + 1, 0x85ebca6b)) >>>
    0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/** Return a deterministic value in [-1, 1] for one pixel/channel. */
function signedNoise(seed: number, pixel: number, channel: number): number {
  return (hashNoise(seed, pixel, channel) / 0xffffffff) * 2 - 1;
}

function applyNoise(
  data: Uint8ClampedArray,
  noise: number,
  monochromatic: boolean,
  seed: number,
): void {
  if (noise <= 0) return;
  const amplitude = (noise / 100) * 255;
  for (let pixel = 0; pixel < data.length / 4; pixel += 1) {
    const offset = pixel * 4;
    if (data[offset + 3] === 0) continue;
    const shared = monochromatic ? signedNoise(seed, pixel, 0) : 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const variation = monochromatic
        ? shared
        : signedNoise(seed, pixel, channel);
      data[offset + channel] = clampByte(
        data[offset + channel] + variation * amplitude,
      );
    }
  }
}

/**
 * Apply Sharpen followed by deterministic Add Noise in place.
 *
 * The alpha channel is preserved exactly.  A neutral adjustment returns
 * without iterating, which makes reset/round-trip operations byte-for-byte
 * stable and inexpensive.
 */
export function applySharpenNoisePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings?: Partial<SharpenNoise>,
): void {
  validateDimensions(data, width, height);
  const a = effectiveSharpenNoise(settings);
  if (isNeutralSharpenNoise(a)) return;
  applySharpen(data, width, height, a.sharpen, a.radius, a.threshold);
  applyNoise(data, a.noise, a.monochromatic, a.seed);
}

/**
 * Process a copy, preserving the caller's source buffer for nondestructive
 * document rendering.  The returned buffer is always a fresh allocation.
 */
export function sharpenNoisePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  settings?: Partial<SharpenNoise>,
): Uint8ClampedArray {
  validateDimensions(source, width, height);
  const output = new Uint8ClampedArray(source);
  applySharpenNoisePixels(output, width, height, settings);
  return output;
}

/** Descriptive alias for callers that prefer an immutable-sounding name. */
export const processSharpenNoisePixels = sharpenNoisePixels;
