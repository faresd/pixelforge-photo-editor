/**
 * Deterministic local Quick Selection primitive.
 *
 * Quick Selection grows from brush samples through connected pixels whose RGB
 * channels stay within the configured tolerance of the sampled colour. It is
 * deliberately local and bounded: no semantic/object inference, network call,
 * or source mutation is involved. Separate brush samples allow a drag to grow
 * across several similarly coloured regions while a strong edge stops the
 * flood.
 */

export type QuickSelectionPoint = { x: number; y: number };

export type QuickSelectionOptions = {
  width: number;
  height: number;
  size: number;
  tolerance: number;
  opacity?: number;
  points: readonly QuickSelectionPoint[];
};

export const quickSelectionBounds = {
  maxPixels: 16_000_000,
  maxDimension: 16_000,
  maxSize: 10_000,
  maxTolerance: 255,
  maxPoints: 512,
  maxRegionPixels: 2_000_000,
} as const;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function validateSource(
  source: ArrayLike<number>,
  width: number,
  height: number,
): void {
  if (!source || source.length !== width * height * 4)
    throw new Error('Quick Selection source must contain RGBA data for every pixel');
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (!finite(value) || value < 0 || value > 255)
      throw new Error('Quick Selection source contains invalid RGBA channels');
  }
}

function validateOptions(options: QuickSelectionOptions): void {
  if (
    !Number.isInteger(options.width) ||
    !Number.isInteger(options.height) ||
    options.width < 1 ||
    options.height < 1 ||
    options.width > quickSelectionBounds.maxDimension ||
    options.height > quickSelectionBounds.maxDimension ||
    options.width * options.height > quickSelectionBounds.maxPixels
  )
    throw new Error('Quick Selection canvas dimensions are invalid');
  if (!finite(options.size) || options.size < 1 || options.size > quickSelectionBounds.maxSize)
    throw new Error('Quick Selection size must be between 1 and 10,000');
  if (!finite(options.tolerance) || options.tolerance < 0 || options.tolerance > quickSelectionBounds.maxTolerance)
    throw new Error('Quick Selection tolerance must be between 0 and 255');
  if (options.opacity !== undefined && (!finite(options.opacity) || options.opacity < 0 || options.opacity > 1))
    throw new Error('Quick Selection opacity must be between 0 and 1');
  if (!Array.isArray(options.points) || options.points.length < 1 || options.points.length > quickSelectionBounds.maxPoints)
    throw new Error('Quick Selection requires between 1 and 512 points');
  for (const point of options.points) {
    if (!point || !finite(point.x) || !finite(point.y))
      throw new Error('Quick Selection points are invalid');
  }
}

function distance(source: ArrayLike<number>, offset: number, target: readonly number[]): number {
  return Math.max(
    Math.abs(source[offset] - target[0]),
    Math.abs(source[offset + 1] - target[1]),
    Math.abs(source[offset + 2] - target[2]),
  );
}

function pixelAt(source: ArrayLike<number>, width: number, height: number, x: number, y: number): number[] {
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const offset = (py * width + px) * 4;
  return [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
}

/**
 * Grow one connected local colour region for every brush sample and return a
 * canvas-sized alpha mask. The output is a new array and the source is read
 * only, so a caller can safely compose it with an existing selection.
 */
export function quickSelectionMask(
  source: ArrayLike<number>,
  options: QuickSelectionOptions,
): Uint8ClampedArray {
  validateOptions(options);
  validateSource(source, options.width, options.height);
  const { width, height, size, tolerance } = options;
  const output = new Uint8ClampedArray(width * height);
  const radius = Math.max(0.5, size / 2);
  const opacity = Math.round((options.opacity ?? 1) * 255);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);
  const queued = new Uint16Array(width * height);
  let stamp = 0;
  for (const point of options.points) {
    stamp = stamp >= 65_535 ? 1 : stamp + 1;
    const seedX = clamp(Math.round(point.x), 0, width - 1);
    const seedY = clamp(Math.round(point.y), 0, height - 1);
    const seed = pixelAt(source, width, height, seedX, seedY);
    if (seed[3] === 0) continue;
    let head = 0;
    let tail = 0;
    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (queued[index] === stamp || tail >= queueX.length) return;
      queued[index] = stamp;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
    };
    enqueue(seedX, seedY);
    let grown = 0;
    while (head < tail && grown < quickSelectionBounds.maxRegionPixels) {
      const x = queueX[head];
      const y = queueY[head];
      head += 1;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = y * width + x;
      if (visited[index]) continue;
      const offset = index * 4;
      if (source[offset + 3] === 0 || distance(source, offset, seed) > tolerance) continue;
      visited[index] = 1;
      output[index] = Math.max(output[index], Math.min(255, opacity));
      grown += 1;
      enqueue(x - 1, y);
      enqueue(x + 1, y);
      enqueue(x, y - 1);
      enqueue(x, y + 1);
      // Brush diameter controls how many nearby pixels seed the growth. This
      // keeps small clicks precise while a larger brush can bridge an edge.
      if (grown === 1 && radius > 1) {
        const steps = Math.min(8, Math.max(1, Math.ceil(radius / 4)));
        for (let step = 1; step <= steps; step += 1) {
          const angle = (step / steps) * Math.PI * 2;
          const sx = Math.round(seedX + Math.cos(angle) * radius);
          const sy = Math.round(seedY + Math.sin(angle) * radius);
          enqueue(sx, sy);
        }
      }
    }
  }
  return output;
}
