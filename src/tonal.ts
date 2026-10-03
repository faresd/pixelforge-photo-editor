/**
 * Deterministic Dodge, Burn and Sponge raster primitives.
 *
 * The editor applies these operations to a private copy of a raster asset and
 * commits the resulting asset as one history entry.  The functions below are
 * deliberately DOM-free: source and destination buffers are never mutated,
 * radial coverage is bounded to the visited rectangle, alpha is preserved,
 * and transparent pixels are left untouched.  That makes tonal edits safe to
 * exercise with exact byte fixtures and to replay after a draft reload.
 */

import { BRUSH_MAX_DIMENSION, BRUSH_MAX_PIXELS, radialStampMask } from './brush.ts';

export const TONAL_RANGES = ['shadows', 'midtones', 'highlights'] as const;
export type TonalRange = (typeof TONAL_RANGES)[number];
export const SPONGE_MODES = ['saturate', 'desaturate'] as const;
export type SpongeMode = (typeof SPONGE_MODES)[number];
export type TonalMode = 'dodge' | 'burn';
export type TonalStrokeOptions = {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  hardness: number;
  /** Exposure in the public API is a normalized 0..1 amount. */
  exposure?: number;
  /** Flow is a normalized 0..1 amount. */
  flow?: number;
  range?: TonalRange;
  mode: TonalMode;
  /** Optional canvas-sized selection alpha (0..255) applied to the stroke. */
  selectionMask?: ArrayLike<number>;
};
export type SpongeStrokeOptions = Omit<TonalStrokeOptions, 'exposure' | 'range' | 'mode'> & {
  /** Saturation/vibrance amount, normalized 0..1. */
  amount?: number;
  mode?: SpongeMode;
};
export type TonalResult = {
  pixels: Uint8ClampedArray;
  /** Maximum radial coverage encountered at each pixel. */
  mask: Uint8ClampedArray;
  changed: boolean;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width < 1 || width > BRUSH_MAX_DIMENSION ||
      !Number.isInteger(height) || height < 1 || height > BRUSH_MAX_DIMENSION ||
      width * height > BRUSH_MAX_PIXELS)
    throw new Error('Tonal canvas dimensions are invalid');
}

function assertPixels(value: ArrayLike<number>, width: number, height: number, label: string): void {
  if (value.length !== width * height * 4) throw new Error(`${label} must contain RGBA data for every pixel`);
  for (let i = 0; i < value.length; i += 1)
    if (!finite(value[i]) || value[i] < 0 || value[i] > 255)
      throw new Error(`${label} contains invalid RGBA channels`);
}

function assertSelectionMask(value: ArrayLike<number> | undefined, width: number, height: number): void {
  if (value === undefined) return;
  if (value.length !== width * height) throw new Error('Selection mask must contain one alpha value per pixel');
  for (let i = 0; i < value.length; i += 1)
    if (!finite(value[i]) || value[i] < 0 || value[i] > 255)
      throw new Error('Selection mask contains invalid alpha values');
}

function assertStroke(options: TonalStrokeOptions | SpongeStrokeOptions): void {
  assertDimensions(options.width, options.height);
  for (const value of [options.x1, options.y1, options.x2, options.y2])
    if (!finite(value)) throw new Error('Tonal stroke points are invalid');
  if (!finite(options.size) || options.size < 1 || options.size > 10000)
    throw new Error('Tonal brush size must be between 1 and 10,000');
  if (!finite(options.hardness) || options.hardness < 0 || options.hardness > 100)
    throw new Error('Tonal brush hardness must be between 0 and 100');
}

function normalized(value: number | undefined, label: string, fallback: number): number {
  const amount = value ?? fallback;
  if (!finite(amount) || amount < 0 || amount > 1) throw new Error(`${label} must be between 0 and 1`);
  return amount;
}

function maskForStroke(options: TonalStrokeOptions | SpongeStrokeOptions): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(options.width * options.height),
    distance = Math.hypot(options.x2 - options.x1, options.y2 - options.y1),
    steps = Math.max(1, Math.ceil(distance / Math.max(1, options.size * 0.5)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps,
      x = options.x1 + (options.x2 - options.x1) * t,
      y = options.y1 + (options.y2 - options.y1) * t,
      radial = radialStampMask({
        width: options.width,
        height: options.height,
        x,
        y,
        size: options.size,
        hardness: options.hardness,
        opacity: 1,
      });
    for (let py = radial.bounds.top; py < radial.bounds.bottom; py += 1)
      for (let px = radial.bounds.left; px < radial.bounds.right; px += 1) {
        const value = radial.data[(py - radial.bounds.top) * radial.width + px - radial.bounds.left],
          offset = py * options.width + px;
        if (value > mask[offset]) mask[offset] = value;
      }
  }
  return mask;
}

function tonalRangeWeight(luminance: number, range: TonalRange): number {
  if (range === 'shadows') return 1 - smoothstep(luminance / 0.72);
  if (range === 'highlights') return smoothstep((luminance - 0.28) / 0.72);
  return 1 - Math.abs(luminance - 0.5) * 2;
}

function applyDodgeBurnPixel(pixels: Uint8ClampedArray, offset: number, amount: number, mode: TonalMode): void {
  if (mode === 'dodge') {
    for (let channel = 0; channel < 3; channel += 1)
      pixels[offset + channel] = Math.round(pixels[offset + channel] + (255 - pixels[offset + channel]) * amount);
  } else {
    for (let channel = 0; channel < 3; channel += 1)
      pixels[offset + channel] = Math.round(pixels[offset + channel] * (1 - amount));
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255, green = g / 255, blue = b / 255,
    max = Math.max(red, green, blue), min = Math.min(red, green, blue), lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min,
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hueChannel(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation <= 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation,
    p = 2 * lightness - q;
  return [
    Math.round(hueChannel(p, q, hue + 1 / 3) * 255),
    Math.round(hueChannel(p, q, hue) * 255),
    Math.round(hueChannel(p, q, hue - 1 / 3) * 255),
  ];
}

/** Apply one immutable Dodge or Burn stroke to an RGBA raster. */
export function applyDodgeBurnStroke(source: ArrayLike<number>, destination: ArrayLike<number>, options: TonalStrokeOptions): TonalResult {
  assertStroke(options);
  assertPixels(source, options.width, options.height, 'Source');
  assertPixels(destination, options.width, options.height, 'Destination');
  assertSelectionMask(options.selectionMask, options.width, options.height);
  if (!['dodge', 'burn'].includes(options.mode)) throw new Error('Tonal mode is invalid');
  if (options.range !== undefined && !TONAL_RANGES.includes(options.range)) throw new Error('Tonal range is invalid');
  const exposure = normalized(options.exposure, 'Exposure', 0.5),
    flow = normalized(options.flow, 'Flow', 1),
    range = options.range ?? 'midtones',
    pixels = new Uint8ClampedArray(destination),
    mask = maskForStroke(options);
  let changed = false;
  for (let index = 0; index < mask.length; index += 1) {
    const coverage = (mask[index] / 255) * (options.selectionMask ? options.selectionMask[index] / 255 : 1),
      offset = index * 4;
    if (coverage <= 0 || pixels[offset + 3] === 0) continue;
    const luminance = (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255,
      amount = clamp(exposure * flow * coverage * tonalRangeWeight(luminance, range), 0, 1);
    if (amount <= 0) continue;
    const before = pixels.slice(offset, offset + 4);
    applyDodgeBurnPixel(pixels, offset, amount, options.mode);
    if (before.some((value, channel) => value !== pixels[offset + channel])) changed = true;
  }
  return { pixels, mask, changed };
}

/** Apply one immutable Sponge (saturate/desaturate) stroke to an RGBA raster. */
export function applySpongeStroke(source: ArrayLike<number>, destination: ArrayLike<number>, options: SpongeStrokeOptions): TonalResult {
  assertStroke(options);
  assertPixels(source, options.width, options.height, 'Source');
  assertPixels(destination, options.width, options.height, 'Destination');
  assertSelectionMask(options.selectionMask, options.width, options.height);
  const amount = normalized(options.amount, 'Sponge amount', 0.5),
    flow = normalized(options.flow, 'Flow', 1),
    mode = options.mode ?? 'saturate';
  if (!SPONGE_MODES.includes(mode)) throw new Error('Sponge mode is invalid');
  const pixels = new Uint8ClampedArray(destination),
    mask = maskForStroke(options);
  let changed = false;
  for (let index = 0; index < mask.length; index += 1) {
    const coverage = (mask[index] / 255) * (options.selectionMask ? options.selectionMask[index] / 255 : 1),
      offset = index * 4;
    if (coverage <= 0 || pixels[offset + 3] === 0) continue;
    const [hue, saturation, lightness] = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]),
      // Saturating low-chroma pixels more strongly is the useful "vibrance"
      // behavior while still producing a bounded, predictable adjustment.
      strength = clamp(amount * flow * coverage * (mode === 'saturate' ? 1 - saturation * 0.55 : 1), 0, 1),
      nextSaturation = mode === 'saturate'
        ? saturation + (1 - saturation) * strength
        : saturation * (1 - strength),
      rgb = hslToRgb(hue, clamp(nextSaturation, 0, 1), lightness),
      before = pixels.slice(offset, offset + 4);
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    if (before.some((value, channel) => value !== pixels[offset + channel])) changed = true;
  }
  return { pixels, mask, changed };
}

/** Single-stamp aliases are useful to callers building their own gestures. */
export const dodgeBurnStroke = applyDodgeBurnStroke;
export const spongeStroke = applySpongeStroke;
