import { colorRangeMask, type ColorRangeColor } from './colorRange.ts';

export type SimilarSelectionOptions = {
  width: number;
  height: number;
  fuzziness?: number;
};

export type SimilarSelectionResult = {
  mask: Uint8ClampedArray;
  target: ColorRangeColor;
};

function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Select colours similar to the current selection without uploading pixels.
 * The seed colour is a premultiplied-alpha weighted average of the selected
 * rendered pixels, then the normal bounded Color Range distance is reused.
 * Inputs remain immutable and transparent/empty seeds fail closed.
 */
export function similarColorMask(
  source: Uint8ClampedArray,
  seedAlpha: Uint8ClampedArray,
  options: SimilarSelectionOptions,
): SimilarSelectionResult {
  const { width, height } = options;
  if (!validDimension(width) || !validDimension(height) || width * height > 16_000_000)
    throw new Error('Similar Selection canvas dimensions are invalid');
  const pixels = width * height;
  if (source.length !== pixels * 4 || seedAlpha.length !== pixels)
    throw new Error('Similar Selection buffers have the wrong size');
  let weight = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alpha = Math.min(seedAlpha[pixel], source[pixel * 4 + 3]);
    if (!alpha) continue;
    const offset = pixel * 4;
    weight += alpha;
    red += source[offset] * alpha;
    green += source[offset + 1] * alpha;
    blue += source[offset + 2] * alpha;
  }
  if (!weight) throw new Error('Similar Selection needs a visible selected pixel');
  const target: ColorRangeColor = [
    Math.round(red / weight),
    Math.round(green / weight),
    Math.round(blue / weight),
  ];
  return {
    target,
    mask: colorRangeMask(source, {
      width,
      height,
      target,
      fuzziness: options.fuzziness,
    }),
  };
}
