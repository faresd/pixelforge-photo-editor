/**
 * Deterministic local Focus Area selection.
 *
 * This privacy-preserving focus proxy selects opaque pixels whose luminance
 * differs from immediate neighbours. It does not claim semantic subject
 * recognition and never sends pixels off-device.
 */
export type FocusAreaOptions = { width: number; height: number; threshold?: number; softness?: number };
export const focusAreaBounds = { maxPixels: 16_000_000, maxDimension: 16_000, maxThreshold: 255, maxSoftness: 255 } as const;
function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > focusAreaBounds.maxDimension || height > focusAreaBounds.maxDimension || width * height > focusAreaBounds.maxPixels) throw new Error('Focus Area canvas dimensions are invalid');
}
function clampByte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }
export function focusAreaMask(source: Uint8ClampedArray, options: FocusAreaOptions): Uint8ClampedArray {
  assertDimensions(options.width, options.height);
  if (source.length !== options.width * options.height * 4) throw new Error('Focus Area source must contain RGBA data for every pixel');
  const threshold = options.threshold ?? 32, softness = options.softness ?? 24;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > focusAreaBounds.maxThreshold) throw new Error('Focus Area threshold must be between 0 and 255');
  if (!Number.isFinite(softness) || softness < 0 || softness > focusAreaBounds.maxSoftness) throw new Error('Focus Area softness must be between 0 and 255');
  const { width, height } = options, luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i += 1) { const offset = i * 4; luminance[i] = source[offset + 3] === 0 ? -1 : 0.2126 * source[offset] + 0.7152 * source[offset + 1] + 0.0722 * source[offset + 2]; }
  const output = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x; if (luminance[index] < 0) continue; let difference = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) { if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue; const neighbour = luminance[ny * width + nx]; if (neighbour >= 0) difference = Math.max(difference, Math.abs(luminance[index] - neighbour)); }
    const edge = softness === 0 ? (difference >= threshold ? 255 : 0) : clampByte(((difference - threshold + softness) / softness) * 255);
    output[index] = Math.min(255, edge * source[index * 4 + 3] / 255);
  }
  return output;
}
