/**
 * Deterministic local Auto Tone, Auto Contrast and Auto Color corrections.
 *
 * These functions operate on detached RGBA byte buffers so the renderer can
 * keep source assets immutable. Fully transparent RGB bytes and every alpha
 * channel are preserved. The persisted adjustment flags are deliberately
 * small; no generated pixels or source image bytes are stored in a project.
 */

export const AUTO_MODES = ['tone', 'contrast', 'color'] as const;
export type AutoMode = (typeof AUTO_MODES)[number];
export type AutoPixels = Uint8ClampedArray<ArrayBufferLike>;
export type AutoAdjustments = {
  tone: boolean;
  contrast: boolean;
  color: boolean;
};

export const neutralAuto: AutoAdjustments = {
  tone: false,
  contrast: false,
  color: false,
};

const MAX_PIXELS = 16_000_000;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));

/** Normalize omitted/legacy flags without retaining malformed values. */
export function effectiveAutoAdjustments(
  value: Partial<AutoAdjustments> | undefined,
): AutoAdjustments {
  return {
    tone: value?.tone === true,
    contrast: value?.contrast === true,
    color: value?.color === true,
  };
}

/** Strict validation for a complete persisted auto-adjustment object. */
export function validAutoAdjustments(value: unknown): value is AutoAdjustments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<AutoAdjustments>;
  return (
    typeof candidate.tone === 'boolean' &&
    typeof candidate.contrast === 'boolean' &&
    typeof candidate.color === 'boolean'
  );
}

export function isNeutralAuto(
  value: Partial<AutoAdjustments> | undefined,
): boolean {
  const normalized = effectiveAutoAdjustments(value);
  return !normalized.tone && !normalized.contrast && !normalized.color;
}

function assertPixels(data: AutoPixels, label = 'Pixels'): void {
  if (!(data instanceof Uint8ClampedArray))
    throw new Error(`${label} must be a Uint8ClampedArray`);
  if (data.length < 4 || data.length % 4 !== 0)
    throw new Error(`${label} must contain complete RGBA pixels`);
  if (data.length / 4 > MAX_PIXELS)
    throw new Error(`${label} exceeds the 16 megapixel auto correction limit`);
  // Uint8ClampedArray construction already clamps values. Keep this check so
  // a cross-realm or custom typed-array implementation cannot bypass safety.
  for (const value of data)
    if (!finite(value) || value < 0 || value > 255)
      throw new Error(`${label} contains invalid RGBA channels`);
}

function visibleOffsets(data: AutoPixels): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < data.length; offset += 4)
    if (data[offset + 3] > 0) offsets.push(offset);
  return offsets;
}

function changedFrom(source: AutoPixels, result: AutoPixels): boolean {
  for (let index = 0; index < source.length; index += 1)
    if (source[index] !== result[index]) return true;
  return false;
}

/** Apply independent per-channel range stretching (Auto Tone). */
export function autoTonePixels(source: AutoPixels): AutoPixels {
  assertPixels(source, 'Source');
  const output = new Uint8ClampedArray(source), offsets = visibleOffsets(source);
  if (!offsets.length) return output;
  const min = [255, 255, 255], max = [0, 0, 0];
  for (const offset of offsets)
    for (let channel = 0; channel < 3; channel += 1) {
      min[channel] = Math.min(min[channel], source[offset + channel]);
      max[channel] = Math.max(max[channel], source[offset + channel]);
    }
  for (const offset of offsets)
    for (let channel = 0; channel < 3; channel += 1) {
      const span = max[channel] - min[channel];
      // A one-byte span is not useful contrast and rounding it can make a
      // visually flat channel flicker between values, so keep it unchanged.
      if (span > 1)
        output[offset + channel] = Math.round(
          ((source[offset + channel] - min[channel]) * 255) / span,
        );
    }
  return output;
}

function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Apply one luminance range to every RGB channel (Auto Contrast). */
export function autoContrastPixels(source: AutoPixels): AutoPixels {
  assertPixels(source, 'Source');
  const output = new Uint8ClampedArray(source), offsets = visibleOffsets(source);
  if (!offsets.length) return output;
  let minimum = 255;
  let maximum = 0;
  for (const offset of offsets) {
    const value = luminance(source[offset], source[offset + 1], source[offset + 2]);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const span = maximum - minimum;
  if (span <= 1) return output;
  for (const offset of offsets)
    for (let channel = 0; channel < 3; channel += 1)
      output[offset + channel] = clamp(
        Math.round(((source[offset + channel] - minimum) * 255) / span),
      );
  return output;
}

/**
 * Apply gray-world channel gains (Auto Color). The target is the mean of the
 * three visible channel means. A zero-mean channel stays unchanged because no
 * finite gain can recover information that is absent from the source.
 */
export function autoColorPixels(source: AutoPixels): AutoPixels {
  assertPixels(source, 'Source');
  const output = new Uint8ClampedArray(source), offsets = visibleOffsets(source);
  if (!offsets.length) return output;
  const sums = [0, 0, 0];
  for (const offset of offsets)
    for (let channel = 0; channel < 3; channel += 1)
      sums[channel] += source[offset + channel];
  const means = sums.map((value) => value / offsets.length);
  const target = (means[0] + means[1] + means[2]) / 3;
  const gains = means.map((mean) => (mean > 0 ? target / mean : 1));
  for (const offset of offsets)
    for (let channel = 0; channel < 3; channel += 1)
      output[offset + channel] = clamp(
        Math.round(source[offset + channel] * gains[channel]),
      );
  return output;
}

function applyMode(source: AutoPixels, mode: AutoMode): AutoPixels {
  if (mode === 'tone') return autoTonePixels(source);
  if (mode === 'contrast') return autoContrastPixels(source);
  if (mode === 'color') return autoColorPixels(source);
  throw new Error('Auto correction mode is invalid');
}

/**
 * Apply enabled modes in a stable order: tone, contrast, then color. The
 * returned buffer is always detached from the caller, including for neutral
 * settings, and `changed` reports any RGB byte difference.
 */
export function applyAutoAdjustmentsPixels(
  source: AutoPixels,
  auto: Partial<AutoAdjustments> | undefined,
): { data: AutoPixels; changed: boolean } {
  assertPixels(source, 'Source');
  const normalized = effectiveAutoAdjustments(auto);
  let data: AutoPixels = new Uint8ClampedArray(source);
  if (normalized.tone) data = applyMode(data, 'tone');
  if (normalized.contrast) data = applyMode(data, 'contrast');
  if (normalized.color) data = applyMode(data, 'color');
  return { data, changed: changedFrom(source, data) };
}
