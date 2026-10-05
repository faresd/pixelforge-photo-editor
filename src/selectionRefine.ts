/**
 * Deterministic alpha morphology for local selection refinement.
 *
 * Selections are represented as canvas-sized alpha masks when a geometric
 * operation cannot be preserved as a simple rectangle/ellipse/path. Grow and
 * contract use a separable max/min filter; Border subtracts the contracted
 * inner result from the expanded outer result, keeping the work bounded and
 * predictable for large documents while preserving partial edge coverage.
 */

export type SelectionRefineMode = 'grow' | 'contract' | 'border';

const MAX_PIXELS = 16_000_000;
const MAX_RADIUS = 1_000;

function validDimensions(width: number, height: number) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width * height <= MAX_PIXELS
  );
}

function validate(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  mode: SelectionRefineMode,
  radius: number,
) {
  if (!validDimensions(width, height)) {
    throw new Error('Selection mask dimensions are invalid.');
  }
  if (alpha.length !== width * height) {
    throw new Error('Selection mask alpha data has the wrong size.');
  }
  if (mode !== 'grow' && mode !== 'contract' && mode !== 'border') {
    throw new Error('Selection refinement mode is invalid.');
  }
  if (!Number.isInteger(radius) || radius < 0 || radius > MAX_RADIUS) {
    throw new Error('Selection refinement radius must be a whole number from 0 to 1000.');
  }
}

/**
 * Grow or contract an alpha mask by a square neighbourhood of `radius`.
 *
 * Two one-dimensional sliding extrema produce the same square morphology as
 * a two-dimensional window, but avoid the O(radius²) cost of checking every
 * neighbour for every pixel. Edge samples are clamped to the document edge,
 * matching canvas selections that cannot extend beyond the frame.
 */
export function refineSelectionAlpha(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  mode: SelectionRefineMode,
  radius: number,
): Uint8ClampedArray {
  validate(alpha, width, height, mode, radius);
  const source = Uint8ClampedArray.from(alpha, (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value)));
  });
  // A border is the bounded difference between the expanded outer selection
  // and the contracted inner selection. Keeping this subtraction in alpha
  // space preserves fractional edge coverage instead of thresholding it.
  if (mode === 'border') {
    if (radius === 0) return new Uint8ClampedArray(source.length);
    const outer = refineSelectionAlpha(source, width, height, 'grow', radius);
    const inner = refineSelectionAlpha(source, width, height, 'contract', radius);
    return Uint8ClampedArray.from(outer, (value, index) =>
      Math.max(0, value - inner[index]),
    );
  }
  if (radius === 0) return source;

  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  const maximize = mode === 'grow';
  const better = (left: number, right: number) =>
    maximize ? left <= right : left >= right;

  /** Apply a centred sliding max/min while clamping both ends of the line. */
  const line = (
    length: number,
    sample: (index: number) => number,
    sink: (index: number, value: number) => void,
  ) => {
    // The padded positions are at most length + 2 * radius, and the queue is
    // monotonic so each position is inserted and removed once.
    const queue = new Int32Array(length + radius * 2 + 1);
    let head = 0;
    let tail = 0;
    const paddedLength = length + radius * 2;
    for (let padded = 0; padded < paddedLength; padded += 1) {
      const sourceIndex = Math.max(
        0,
        Math.min(length - 1, padded - radius),
      );
      const value = sample(sourceIndex);
      while (
        tail > head &&
        better(sample(Math.max(0, Math.min(length - 1, queue[tail - 1] - radius))), value)
      ) {
        tail -= 1;
      }
      queue[tail] = padded;
      tail += 1;
      while (tail > head && queue[head] < padded - radius * 2) head += 1;
      if (padded >= radius * 2) {
        const center = padded - radius * 2;
        const selected = queue[head];
        sink(center, sample(Math.max(0, Math.min(length - 1, selected - radius))));
      }
    }
  };

  // Horizontal sliding max/min for each row.
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    line(
      width,
      (x) => source[row + x],
      (x, value) => { horizontal[row + x] = value; },
    );
  }

  // Vertical sliding max/min for each column.
  for (let x = 0; x < width; x += 1) {
    line(
      height,
      (y) => horizontal[y * width + x],
      (y, value) => { output[y * width + x] = value; },
    );
  }
  return output;
}

export const selectionRefineBounds = {
  maxPixels: MAX_PIXELS,
  maxRadius: MAX_RADIUS,
};
