/**
 * Deterministic local background removal.
 *
 * The operation labels connected colour regions that touch the canvas edge as
 * background and returns a canvas-sized alpha mask. It never mutates source
 * pixels and deliberately does not claim semantic subject detection: the
 * result is a bounded, offline fallback that is predictable for icons,
 * product photos and flat backdrops.
 */

export type BackgroundMaskResult = {
  mask: Uint8ClampedArray;
  removedPixels: number;
  totalPixels: number;
  /** Opaque/partially opaque source pixels used for the UI removal ratio. */
  eligiblePixels: number;
};

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function assertInput(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
) {
  if (!(pixels instanceof Uint8ClampedArray))
    throw new Error('Background removal pixels are invalid');
  if (!integer(width, 1, 16000) || !integer(height, 1, 16000))
    throw new Error('Background removal dimensions are invalid');
  if (width * height > 16_000_000)
    throw new Error('Background removal is limited to 16 megapixels');
  if (pixels.length !== width * height * 4)
    throw new Error('Background removal pixel length is invalid');
  if (!integer(tolerance, 0, 255))
    throw new Error('Background removal tolerance is invalid');
}

/**
 * Build an alpha mask from an RGBA source. Edge-connected regions are removed
 * while interior regions keep their original alpha, including soft edges.
 * Components are compared to their own seed colour, making the result useful
 * for multi-colour backdrops without a network model or hidden upload.
 */
export function removeConnectedBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 24,
): BackgroundMaskResult {
  assertInput(pixels, width, height, tolerance);
  const mask = new Uint8ClampedArray(width * height * 4);
  // White RGB makes the asset useful for inspection; only alpha drives the
  // compositor and the source RGB bytes remain untouched in the document.
  for (let i = 0; i < mask.length; i += 4) {
    mask[i] = 255;
    mask[i + 1] = 255;
    mask[i + 2] = 255;
    mask[i + 3] = pixels[i + 3];
  }
  const pixelCount = width * height;
  const seen = new Uint8Array(pixelCount);
  // One bounded work queue doubles as the component member list: entries are
  // retained until the component is classified, avoiding a second JS array
  // (which can otherwise consume hundreds of MB on a 16MP image).
  const work = new Uint32Array(pixelCount);
  let removedPixels = 0;
  let eligiblePixels = 0;
  const sameAs = (offset: number, seed: number) =>
    Math.max(
      Math.abs(pixels[offset] - pixels[seed]),
      Math.abs(pixels[offset + 1] - pixels[seed + 1]),
      Math.abs(pixels[offset + 2] - pixels[seed + 2]),
      Math.abs(pixels[offset + 3] - pixels[seed + 3]),
    ) <= tolerance;

  for (let start = 0; start < pixelCount; start += 1) {
    if (seen[start]) continue;
    const seed = start * 4;
    let head = 0;
    let tail = 1;
    work[0] = start;
    let touchesEdge = false;
    seen[start] = 1;
    while (head < tail) {
      const current = work[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      const offset = current * 4;
      if (pixels[offset + 3] !== 0) eligiblePixels += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
        touchesEdge = true;
      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || seen[next] || !sameAs(next * 4, seed)) continue;
        seen[next] = 1;
        work[tail++] = next;
      }
      // Alpha-zero pixels are always transparent in the result even when an
      // RGB-only source has an isolated transparent component.
      if (pixels[offset + 3] === 0) mask[offset + 3] = 0;
    }
    if (touchesEdge) {
      for (let i = 0; i < tail; i += 1) {
        const current = work[i];
        const offset = current * 4;
        if (pixels[offset + 3] !== 0) removedPixels += 1;
        mask[offset + 3] = 0;
      }
    } else {
      for (let i = 0; i < tail; i += 1) {
        const current = work[i];
        const offset = current * 4;
        // The mask is coverage, not source alpha. Compositing multiplies the
        // source alpha by this value, so retaining 180 here would attenuate a
        // semitransparent source twice. Transparent source pixels stay clear.
        mask[offset + 3] = pixels[offset + 3] === 0 ? 0 : 255;
      }
    }
  }
  return { mask, removedPixels, totalPixels: pixelCount, eligiblePixels };
}

/** Browser adapter used by the editor; the pure function above stays testable. */
export function createBackgroundMask(
  source: HTMLCanvasElement,
  tolerance = 24,
): {
  canvas: HTMLCanvasElement;
  removedPixels: number;
  totalPixels: number;
  eligiblePixels: number;
} {
  if (!source || !source.getContext)
    throw new Error('Background removal source is invalid');
  const context = source.getContext('2d');
  if (!context) throw new Error('Background removal canvas is unavailable');
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  const result = removeConnectedBackground(
    pixels,
    source.width,
    source.height,
    tolerance,
  );
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const output = canvas.getContext('2d');
  if (!output) throw new Error('Background removal mask canvas is unavailable');
  const image = output.createImageData(source.width, source.height);
  image.data.set(result.mask);
  output.putImageData(image, 0, 0);
  return {
    canvas,
    removedPixels: result.removedPixels,
    totalPixels: result.totalPixels,
    eligiblePixels: result.eligiblePixels,
  };
}
