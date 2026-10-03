/**
 * Nondestructive raster layer-mask primitives.
 *
 * Layer masks are stored as canvas-sized alpha assets by the document model;
 * these helpers keep the pixel operation independent from Canvas 2D so mask
 * edits can be replayed, validated and tested without mutating source pixels.
 */

export type LayerMaskSettings = {
  /** Whether the mask participates in compositing. */
  enabled: boolean;
  /** When true, the mask alpha is complemented before compositing. */
  inverted: boolean;
};

export const neutralLayerMask: LayerMaskSettings = {
  enabled: true,
  inverted: false,
};

/** Fill missing mask metadata from drafts written before mask controls existed. */
export function effectiveLayerMask(
  value: Partial<LayerMaskSettings> | null | undefined,
): LayerMaskSettings {
  return {
    enabled:
      typeof value?.enabled === 'boolean'
        ? value.enabled
        : neutralLayerMask.enabled,
    inverted:
      typeof value?.inverted === 'boolean'
        ? value.inverted
        : neutralLayerMask.inverted,
  };
}

/** Strict validation for the persisted mask metadata object. */
export function validLayerMask(value: unknown): value is LayerMaskSettings {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as LayerMaskSettings).enabled === 'boolean' &&
    typeof (value as LayerMaskSettings).inverted === 'boolean'
  );
}

/** Invert alpha values without changing the caller's mask buffer. */
export function invertMaskAlpha(
  maskAlpha: ArrayLike<number>,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(maskAlpha.length);
  for (let i = 0; i < maskAlpha.length; i += 1)
    result[i] = 255 - Math.max(0, Math.min(255, Number(maskAlpha[i]) || 0));
  return result;
}

/**
 * Composite an alpha mask over an RGBA buffer. RGB channels and source alpha
 * remain immutable from the caller's perspective; only output alpha changes.
 * A disabled mask returns an exact copy of the source buffer.
 */
export function applyLayerMaskPixels(
  source: ArrayLike<number>,
  maskAlpha: ArrayLike<number>,
  settings?: Partial<LayerMaskSettings>,
): Uint8ClampedArray {
  if (source.length % 4 !== 0)
    throw new Error('Layer mask source must contain RGBA pixels');
  const pixels = source.length / 4;
  if (maskAlpha.length !== pixels)
    throw new Error('Layer mask alpha must contain one value per pixel');
  const value = effectiveLayerMask(settings),
    result = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 1) result[i] = Number(source[i]) || 0;
  if (!value.enabled) return result;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alpha = Math.max(0, Math.min(255, Number(maskAlpha[pixel]) || 0)),
      factor = value.inverted ? 255 - alpha : alpha,
      sourceAlpha = result[pixel * 4 + 3];
    result[pixel * 4 + 3] = Math.round((sourceAlpha * factor) / 255);
  }
  return result;
}
