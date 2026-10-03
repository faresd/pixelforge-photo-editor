/**
 * Deterministic, immutable Smudge raster primitive.
 *
 * A stroke samples an immutable source snapshot behind the drag direction and
 * blends that colour into a separate destination buffer.  This mirrors the
 * useful part of Photoshop's Smudge tool while keeping edits replayable:
 * source and destination inputs are never mutated, alpha bytes are preserved,
 * transparent pixels keep their hidden RGB, and selection alpha clips the
 * operation before it reaches a pixel.
 */

import { BRUSH_MAX_DIMENSION, BRUSH_MAX_PIXELS, radialStampMask } from './brush.ts';

export type SmudgeStrokeOptions = {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  hardness: number;
  /** Flow is a normalized 0..1 blend amount. */
  flow?: number;
  /** Optional canvas-sized selection alpha (0..255). */
  selectionMask?: ArrayLike<number>;
};

export type SmudgeResult = {
  /** Fresh RGBA bytes; source and destination are never mutated. */
  pixels: Uint8ClampedArray;
  /** Maximum radial coverage encountered at each pixel. */
  mask: Uint8ClampedArray;
  changed: boolean;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > BRUSH_MAX_DIMENSION ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > BRUSH_MAX_DIMENSION ||
    width * height > BRUSH_MAX_PIXELS
  )
    throw new Error('Smudge canvas dimensions are invalid');
}

function assertPixels(
  value: ArrayLike<number>,
  width: number,
  height: number,
  label: string,
): void {
  if (!value || value.length !== width * height * 4)
    throw new Error(`${label} must contain RGBA data for every pixel`);
  for (let i = 0; i < value.length; i += 1)
    if (!finite(value[i]) || value[i] < 0 || value[i] > 255)
      throw new Error(`${label} contains invalid RGBA channels`);
}

function assertSelectionMask(
  value: ArrayLike<number> | undefined,
  width: number,
  height: number,
): void {
  if (value === undefined) return;
  if (value.length !== width * height)
    throw new Error('Selection mask must contain one alpha value per pixel');
  for (let i = 0; i < value.length; i += 1)
    if (!finite(value[i]) || value[i] < 0 || value[i] > 255)
      throw new Error('Selection mask contains invalid alpha values');
}

function assertStroke(options: SmudgeStrokeOptions): void {
  assertDimensions(options.width, options.height);
  for (const value of [options.x1, options.y1, options.x2, options.y2])
    if (!finite(value)) throw new Error('Smudge stroke points are invalid');
  if (!finite(options.size) || options.size < 1 || options.size > 10000)
    throw new Error('Smudge brush size must be between 1 and 10,000');
  if (!finite(options.hardness) || options.hardness < 0 || options.hardness > 100)
    throw new Error('Smudge brush hardness must be between 0 and 100');
  const flow = options.flow ?? 1;
  if (!finite(flow) || flow < 0 || flow > 1)
    throw new Error('Flow must be between 0 and 1');
}

function strokeMask(options: SmudgeStrokeOptions): Uint8ClampedArray {
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
        const value =
            radial.data[(py - radial.bounds.top) * radial.width + px - radial.bounds.left],
          offset = py * options.width + px;
        if (value > mask[offset]) mask[offset] = value;
      }
  }
  return mask;
}

/** Apply one immutable Smudge stroke to an RGBA raster. */
export function applySmudgeStroke(
  source: ArrayLike<number>,
  destination: ArrayLike<number>,
  options: SmudgeStrokeOptions,
): SmudgeResult {
  assertStroke(options);
  assertPixels(source, options.width, options.height, 'Source');
  assertPixels(destination, options.width, options.height, 'Destination');
  assertSelectionMask(options.selectionMask, options.width, options.height);

  const distance = Math.hypot(options.x2 - options.x1, options.y2 - options.y1);
  if (distance === 0) {
    return {
      pixels: new Uint8ClampedArray(destination),
      mask: new Uint8ClampedArray(options.width * options.height),
      changed: false,
    };
  }

  const pixels = new Uint8ClampedArray(destination),
    mask = strokeMask(options),
    // A click has no direction and is therefore an intentional no-op. This
    // prevents accidental history entries when a user taps the canvas.
    directionX = (options.x2 - options.x1) / distance,
    directionY = (options.y2 - options.y1) / distance,
    // Sampling one quarter of the brush diameter behind the cursor gives a
    // visible, stable smear without over-stretching broad strokes.
    sampleDistance = Math.max(1, options.size * 0.25),
    flow = options.flow ?? 1;
  let changed = false;

  for (let index = 0; index < mask.length; index += 1) {
    const coverage =
      (mask[index] / 255) *
      (options.selectionMask ? options.selectionMask[index] / 255 : 1),
      destinationOffset = index * 4;
    if (coverage <= 0 || pixels[destinationOffset + 3] === 0) continue;

    const px = index % options.width,
      py = Math.floor(index / options.width),
      sampleX = clamp(
        Math.round(px - directionX * sampleDistance),
        0,
        options.width - 1,
      ),
      sampleY = clamp(
        Math.round(py - directionY * sampleDistance),
        0,
        options.height - 1,
      ),
      sourceOffset = (sampleY * options.width + sampleX) * 4,
      sourceAlpha = source[sourceOffset + 3];
    // Do not pull hidden RGB out of transparent source pixels. Alpha itself
    // stays byte-identical, so a smudge never creates a semi-transparent edge.
    if (sourceAlpha === 0) continue;
    const amount = clamp(coverage * flow * (sourceAlpha / 255), 0, 1);
    if (amount <= 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const before = pixels[destinationOffset + channel],
        next = Math.round(before + (source[sourceOffset + channel] - before) * amount);
      pixels[destinationOffset + channel] = next;
      if (next !== before) changed = true;
    }
  }
  return { pixels, mask, changed };
}

/** Alias for callers that use the tool name as the operation name. */
export const smudgeStroke = applySmudgeStroke;
