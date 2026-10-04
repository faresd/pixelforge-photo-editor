/**
 * Deterministic local Selection Brush primitives.
 *
 * The tool paints a canvas-sized alpha mask with a pressure-aware circular
 * brush. A gesture is accumulated into its own mask and then combined with
 * the existing selection, which keeps replace/add/subtract/intersect semantics
 * stable even when a pointer path contains many segments.
 */

export type SelectionBrushOperation = 'replace' | 'add' | 'subtract' | 'intersect';

export type SelectionBrushOptions = {
  width: number;
  height: number;
  size: number;
  hardness: number;
  opacity: number;
  pressure?: number;
  pressureSize?: boolean;
  pressureOpacity?: boolean;
};

const MAX_PIXELS = 16_000_000;
const MAX_SIZE = 10_000;

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function validateOptions(options: SelectionBrushOptions) {
  if (
    !Number.isInteger(options.width) ||
    !Number.isInteger(options.height) ||
    options.width < 1 ||
    options.height < 1 ||
    options.width * options.height > MAX_PIXELS
  )
    throw new Error('Selection Brush dimensions are invalid.');
  if (!finite(options.size, 1, MAX_SIZE))
    throw new Error('Selection Brush size must be between 1 and 10,000.');
  if (!finite(options.hardness, 0, 100))
    throw new Error('Selection Brush hardness must be between 0 and 100.');
  if (!finite(options.opacity, 0, 1))
    throw new Error('Selection Brush opacity must be between 0 and 1.');
  if (
    options.pressure !== undefined &&
    !finite(options.pressure, 0, 1)
  )
    throw new Error('Selection Brush pressure must be between 0 and 1.');
}

function coverage(distance: number, radius: number, hardness: number) {
  if (distance > radius) return 0;
  if (hardness >= 100 || radius <= 0) return 1;
  const feather = Math.max(0.0001, radius * (1 - hardness / 100));
  return Math.max(0, Math.min(1, (radius - distance) / feather));
}

function effective(options: SelectionBrushOptions) {
  const pressure = options.pressure ?? 1;
  return {
    size: options.size * (options.pressureSize ? pressure : 1),
    opacity: options.opacity * (options.pressureOpacity ? pressure : 1),
  };
}

/** Paint one segment into a detached stroke mask. */
export function paintSelectionBrushSegment(
  mask: ArrayLike<number>,
  options: SelectionBrushOptions & {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  },
): { mask: Uint8ClampedArray; changed: boolean } {
  validateOptions(options);
  if (mask.length !== options.width * options.height)
    throw new Error('Selection Brush mask has the wrong size.');
  if (![options.x1, options.y1, options.x2, options.y2].every(Number.isFinite))
    throw new Error('Selection Brush coordinates are invalid.');
  const output = Uint8ClampedArray.from(mask, (value) =>
      Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0,
    ),
    { size, opacity } = effective(options),
    radius = size / 2,
    distance = Math.hypot(options.x2 - options.x1, options.y2 - options.y1),
    steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5))),
    hardness = options.hardness;
  if (opacity <= 0) return { mask: output, changed: false };
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps,
      cx = options.x1 + (options.x2 - options.x1) * t,
      cy = options.y1 + (options.y2 - options.y1) * t,
      left = Math.max(0, Math.floor(cx - radius)),
      right = Math.min(options.width - 1, Math.ceil(cx + radius)),
      top = Math.max(0, Math.floor(cy - radius)),
      bottom = Math.min(options.height - 1, Math.ceil(cy + radius));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const amount = coverage(Math.hypot(x - cx, y - cy), radius, hardness) * opacity;
        if (amount <= 0) continue;
        const index = y * options.width + x,
          before = output[index],
          after = Math.max(before, Math.round(amount * 255));
        if (after !== before) {
          output[index] = after;
          changed = true;
        }
      }
    }
  }
  return { mask: output, changed };
}

/** Combine an accumulated brush stroke with the current selection alpha. */
export function combineSelectionBrushMasks(
  current: ArrayLike<number> | undefined,
  stroke: ArrayLike<number>,
  operation: SelectionBrushOperation,
): { mask: Uint8ClampedArray; changed: boolean } {
  if (!['replace', 'add', 'subtract', 'intersect'].includes(operation))
    throw new Error('Selection Brush operation is invalid.');
  if (current && current.length !== stroke.length)
    throw new Error('Selection Brush masks have different sizes.');
  const output = new Uint8ClampedArray(stroke.length),
    before = current
      ? Uint8ClampedArray.from(current, (value) =>
          Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0,
        )
      : new Uint8ClampedArray(stroke.length),
    next = Uint8ClampedArray.from(stroke, (value) =>
      Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0,
    );
  let changed = false;
  for (let index = 0; index < output.length; index += 1) {
    const left = before[index], right = next[index];
    output[index] =
      operation === 'replace'
        ? right
        : operation === 'add'
          ? Math.max(left, right)
          : operation === 'subtract'
            ? Math.round(left * (1 - right / 255))
            : Math.min(left, right);
    if (output[index] !== left) changed = true;
  }
  return { mask: output, changed };
}

export const selectionBrushBounds = {
  maxPixels: MAX_PIXELS,
  maxSize: MAX_SIZE,
};
