/**
 * Deterministic Photoshop-style Color Range selection.
 *
 * The operation samples one RGB colour and returns a canvas-sized alpha mask.
 * Fuzziness is a bounded channel distance (0..255): an exact match is fully
 * selected, colours at the edge of the range fade to zero, and pixels outside
 * the range are transparent. Source alpha is multiplied into the result so
 * transparent pixels never reveal hidden RGB data. The input bytes are never
 * mutated, making the result safe to publish as a project asset and undo.
 */

export type ColorRangeColor = readonly [number, number, number];

export type ColorRangeOptions = {
  width: number;
  height: number;
  target: ColorRangeColor;
  /** Maximum absolute RGB channel distance. 0 selects exact RGB matches. */
  fuzziness?: number;
};

export const colorRangeBounds = {
  maxPixels: 16_000_000,
  maxDimension: 16_000,
  maxFuzziness: 255,
} as const;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > colorRangeBounds.maxDimension ||
    height > colorRangeBounds.maxDimension ||
    width * height > colorRangeBounds.maxPixels
  ) {
    throw new Error('Color Range canvas dimensions are invalid');
  }
}

function assertPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): void {
  if (!pixels || pixels.length !== width * height * 4)
    throw new Error('Color Range source must contain RGBA data for every pixel');
  if (!(pixels instanceof Uint8ClampedArray)) {
    for (let i = 0; i < pixels.length; i += 1) {
      const value = pixels[i];
      if (!finite(value) || value < 0 || value > 255)
        throw new Error('Color Range source contains invalid RGBA channels');
    }
  }
}

function assertTarget(target: ColorRangeColor): void {
  if (
    !Array.isArray(target) ||
    target.length !== 3 ||
    !target.every((value) => finite(value) && value >= 0 && value <= 255)
  ) {
    throw new Error('Color Range target must contain three 8-bit channels');
  }
}

/**
 * Build a soft alpha mask from RGB channel distance.
 *
 * Fuzziness zero is intentionally exact, which is useful for flat logos and
 * also avoids a division-by-zero branch producing platform-specific NaNs.
 */
export function colorRangeMask(
  source: ArrayLike<number>,
  options: ColorRangeOptions,
): Uint8ClampedArray {
  assertDimensions(options.width, options.height);
  assertPixels(source, options.width, options.height);
  assertTarget(options.target);
  const fuzziness = options.fuzziness ?? 32;
  if (!finite(fuzziness) || fuzziness < 0 || fuzziness > colorRangeBounds.maxFuzziness)
    throw new Error('Color Range fuzziness must be between 0 and 255');

  const output = new Uint8ClampedArray(options.width * options.height);
  const [red, green, blue] = options.target;
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * 4;
    const alpha = source[offset + 3];
    if (alpha === 0) continue;
    const distance = Math.max(
      Math.abs(source[offset] - red),
      Math.abs(source[offset + 1] - green),
      Math.abs(source[offset + 2] - blue),
    );
    let coverage = 0;
    if (fuzziness === 0) coverage = distance === 0 ? 255 : 0;
    else if (distance < fuzziness)
      coverage = Math.round((1 - distance / fuzziness) * 255);
    output[pixel] = Math.round((coverage * alpha) / 255);
  }
  return output;
}

/** Return the maximum RGB channel distance for diagnostics and tests. */
export function colorRangeDistance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  assertTarget(left);
  assertTarget(right);
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
}
