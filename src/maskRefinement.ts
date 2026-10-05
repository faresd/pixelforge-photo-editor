/**
 * Deterministic, nondestructive layer-mask refinement.
 *
 * A refinement stroke edits only the alpha coverage of an existing canvas-sized
 * mask. Source RGB/alpha bytes are never touched by this helper; callers can
 * publish the detached result as a new mask asset for undo and persistence.
 */

import { brushCoverage } from './brush.ts';

export const MASK_REFINEMENT_MAX_POINTS = 256;
export const MASK_REFINEMENT_MAX_STROKES = 128;
export const MASK_REFINEMENT_MAX_SIZE = 10000;
export const MASK_REFINEMENT_MAX_DIMENSION = 16000;
export const MASK_REFINEMENT_MAX_PIXELS = 16000000;

export type MaskRefinementMode = 'reveal' | 'conceal';
export type MaskRefinementPoint = {
  x: number;
  y: number;
  pressure?: number;
};
export type MaskRefinementStroke = {
  version: 1;
  points: MaskRefinementPoint[];
  size: number;
  hardness: number;
  opacity: number;
  mode: MaskRefinementMode;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) &&
    width >= 1 && width <= MASK_REFINEMENT_MAX_DIMENSION &&
    Number.isInteger(height) &&
    height >= 1 && height <= MASK_REFINEMENT_MAX_DIMENSION &&
    width * height <= MASK_REFINEMENT_MAX_PIXELS;
}

function assertDimensions(width: number, height: number): void {
  if (!validDimensions(width, height))
    throw new Error('Mask refinement dimensions are invalid');
}

function assertStroke(stroke: MaskRefinementStroke): void {
  if (!stroke || stroke.version !== 1 || !Array.isArray(stroke.points) ||
      stroke.points.length < 1 || stroke.points.length > MASK_REFINEMENT_MAX_POINTS)
    throw new Error('Mask refinement stroke is invalid');
  if (!finite(stroke.size) || stroke.size < 1 || stroke.size > MASK_REFINEMENT_MAX_SIZE)
    throw new Error('Mask refinement size is invalid');
  if (!finite(stroke.hardness) || stroke.hardness < 0 || stroke.hardness > 100)
    throw new Error('Mask refinement hardness is invalid');
  if (!finite(stroke.opacity) || stroke.opacity < 0 || stroke.opacity > 1)
    throw new Error('Mask refinement opacity is invalid');
  if (stroke.mode !== 'reveal' && stroke.mode !== 'conceal')
    throw new Error('Mask refinement mode is invalid');
  for (const point of stroke.points) {
    if (!point || !finite(point.x) || !finite(point.y) ||
        (point.pressure !== undefined &&
          (!finite(point.pressure) || point.pressure < 0 || point.pressure > 1)))
      throw new Error('Mask refinement point is invalid');
  }
}

export function validMaskRefinementStroke(value: unknown): value is MaskRefinementStroke {
  try {
    assertStroke(value as MaskRefinementStroke);
    return true;
  } catch {
    return false;
  }
}

function stamp(
  output: Uint8ClampedArray,
  width: number,
  height: number,
  point: MaskRefinementPoint,
  stroke: MaskRefinementStroke,
): boolean {
  const pressure = point.pressure === undefined ? 1 : clamp(point.pressure, 0, 1),
    radius = Math.max(0.5, (stroke.size * pressure) / 2),
    opacity = clamp(stroke.opacity * pressure, 0, 1),
    left = Math.max(0, Math.floor(point.x - radius)),
    top = Math.max(0, Math.floor(point.y - radius)),
    right = Math.min(width, Math.floor(point.x + radius) + 1),
    bottom = Math.min(height, Math.floor(point.y + radius) + 1);
  let changed = false;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const coverage = brushCoverage(
        x + 0.5 - point.x,
        y + 0.5 - point.y,
        radius,
        stroke.hardness,
      );
      if (!coverage || !opacity) continue;
      const index = (y * width + x) * 4 + 3,
        before = output[index],
        amount = coverage * opacity;
      output[index] = stroke.mode === 'reveal'
        ? Math.round(before + (255 - before) * amount)
        : Math.round(before * (1 - amount));
      changed = changed || output[index] !== before;
    }
  }
  return changed;
}

/**
 * Apply one mask refinement stroke to an RGBA mask and return a detached
 * buffer. Alpha is the only edited channel; RGB (including transparent hidden
 * bytes) is copied byte-for-byte from the input.
 */
export function applyMaskRefinementPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  stroke: MaskRefinementStroke,
): { pixels: Uint8ClampedArray; changed: boolean } {
  assertDimensions(width, height);
  if (!(source instanceof Uint8ClampedArray) || source.length !== width * height * 4)
    throw new Error('Mask refinement source must contain RGBA data');
  assertStroke(stroke);
  const output = new Uint8ClampedArray(source);
  let changed = false;
  const spacing = Math.max(1, stroke.size * 0.25);
  for (let index = 0; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    if (index === 0) {
      changed = stamp(output, width, height, point, stroke) || changed;
      continue;
    }
    const previous = stroke.points[index - 1];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      changed = stamp(output, width, height, {
        x: previous.x + (point.x - previous.x) * t,
        y: previous.y + (point.y - previous.y) * t,
        pressure: (previous.pressure ?? 1) +
          ((point.pressure ?? 1) - (previous.pressure ?? 1)) * t,
      }, stroke) || changed;
    }
  }
  return { pixels: output, changed };
}

export function validateMaskRefinementStrokes(value: unknown): value is MaskRefinementStroke[] {
  if (!Array.isArray(value) || value.length > MASK_REFINEMENT_MAX_STROKES) return false;
  return value.every(validMaskRefinementStroke);
}
