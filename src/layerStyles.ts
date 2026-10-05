/**
 * Bounded, nondestructive layer decorations.  These values intentionally live
 * beside layer metadata instead of being baked into an asset so moving,
 * duplicating, undoing and reopening a document preserve the original pixels.
 */
export type DropShadowStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
};

export type OutlineStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  width: number;
};

export type LayerStyles = {
  dropShadow: DropShadowStyle;
  outline: OutlineStyle;
};

export const neutralLayerStyles: LayerStyles = {
  dropShadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.5,
    offsetX: 8,
    offsetY: 8,
    blur: 12,
  },
  outline: {
    enabled: false,
    color: '#ffffff',
    opacity: 1,
    width: 2,
  },
};

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const hex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

export function effectiveLayerStyles(value: Partial<LayerStyles> | undefined): LayerStyles {
  const shadow = value?.dropShadow;
  const outline = value?.outline;
  return {
    dropShadow: {
      ...neutralLayerStyles.dropShadow,
      ...shadow,
      color: hex(shadow?.color) ? shadow!.color : neutralLayerStyles.dropShadow.color,
      opacity: finite(shadow?.opacity, 0, 1)
        ? shadow!.opacity
        : neutralLayerStyles.dropShadow.opacity,
      offsetX: finite(shadow?.offsetX, -256, 256)
        ? shadow!.offsetX
        : neutralLayerStyles.dropShadow.offsetX,
      offsetY: finite(shadow?.offsetY, -256, 256)
        ? shadow!.offsetY
        : neutralLayerStyles.dropShadow.offsetY,
      blur: finite(shadow?.blur, 0, 64)
        ? shadow!.blur
        : neutralLayerStyles.dropShadow.blur,
      enabled: typeof shadow?.enabled === 'boolean'
        ? shadow.enabled
        : neutralLayerStyles.dropShadow.enabled,
    },
    outline: {
      ...neutralLayerStyles.outline,
      ...outline,
      color: hex(outline?.color) ? outline!.color : neutralLayerStyles.outline.color,
      opacity: finite(outline?.opacity, 0, 1)
        ? outline!.opacity
        : neutralLayerStyles.outline.opacity,
      width: finite(outline?.width, 1, 32)
        ? outline!.width
        : neutralLayerStyles.outline.width,
      enabled: typeof outline?.enabled === 'boolean'
        ? outline.enabled
        : neutralLayerStyles.outline.enabled,
    },
  };
}

export function validLayerStyles(value: unknown): value is LayerStyles {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LayerStyles>;
  const shadow = candidate.dropShadow,
    outline = candidate.outline;
  return Boolean(
    shadow &&
      typeof shadow === 'object' &&
      typeof shadow.enabled === 'boolean' &&
      hex(shadow.color) &&
      finite(shadow.opacity, 0, 1) &&
      finite(shadow.offsetX, -256, 256) &&
      finite(shadow.offsetY, -256, 256) &&
      finite(shadow.blur, 0, 64) &&
      outline &&
      typeof outline === 'object' &&
      typeof outline.enabled === 'boolean' &&
      hex(outline.color) &&
      finite(outline.opacity, 0, 1) &&
      finite(outline.width, 1, 32),
  );
}

export function isNeutralLayerStyles(value: Partial<LayerStyles> | undefined): boolean {
  const styles = effectiveLayerStyles(value);
  return !styles.dropShadow.enabled && !styles.outline.enabled;
}

function color(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function over(
  target: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const source = Math.max(0, Math.min(1, alpha / 255));
  const destination = target[offset + 3] / 255;
  const result = source + destination * (1 - source);
  if (result <= 0) return;
  target[offset] = Math.round((red * source + target[offset] * destination * (1 - source)) / result);
  target[offset + 1] = Math.round((green * source + target[offset + 1] * destination * (1 - source)) / result);
  target[offset + 2] = Math.round((blue * source + target[offset + 2] * destination * (1 - source)) / result);
  target[offset + 3] = Math.round(result * 255);
}

/** A deterministic separable box blur over alpha only. */
function blurAlpha(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return source.slice();
  const horizontal = new Uint8ClampedArray(width * height), output = new Uint8ClampedArray(width * height), span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x < width + radius; x += 1) {
      if (x + radius < width && x + radius >= 0) sum += source[y * width + x + radius];
      if (x - radius - 1 >= 0 && x - radius - 1 < width) sum -= source[y * width + x - radius - 1];
      if (x >= 0 && x < width) horizontal[y * width + x] = Math.round(sum / span);
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y < height + radius; y += 1) {
      if (y + radius < height && y + radius >= 0) sum += horizontal[(y + radius) * width + x];
      if (y - radius - 1 >= 0 && y - radius - 1 < height) sum -= horizontal[(y - radius - 1) * width + x];
      if (y >= 0 && y < height) output[y * width + x] = Math.round(sum / span);
    }
  }
  return output;
}

/**
 * Apply the editable style stack to RGBA pixels without mutating the source.
 * This pure function is shared by the main thread and the render worker.
 */
export function applyLayerStylesPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<LayerStyles> | undefined,
): Uint8ClampedArray {
  const styles = effectiveLayerStyles(value);
  if (isNeutralLayerStyles(styles) || width <= 0 || height <= 0) return source.slice();
  const output = new Uint8ClampedArray(source.length), alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = source[i * 4 + 3];
  if (styles.dropShadow.enabled) {
    const shadowAlpha = blurAlpha(alpha, width, height, Math.round(styles.dropShadow.blur));
    const [r, g, b] = color(styles.dropShadow.color);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const sx = x - Math.round(styles.dropShadow.offsetX), sy = y - Math.round(styles.dropShadow.offsetY);
        if (sx >= 0 && sx < width && sy >= 0 && sy < height)
          over(output, (y * width + x) * 4, r, g, b, shadowAlpha[sy * width + sx] * styles.dropShadow.opacity);
      }
  }
  if (styles.outline.enabled) {
    const [r, g, b] = color(styles.outline.color), radius = Math.round(styles.outline.width);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        let max = 0;
        for (let oy = -radius; oy <= radius && max < 255; oy += 1)
          for (let ox = -radius; ox <= radius; ox += 1) {
            const sx = x + ox, sy = y + oy;
            if (sx >= 0 && sx < width && sy >= 0 && sy < height) max = Math.max(max, alpha[sy * width + sx]);
          }
        const own = alpha[y * width + x];
        if (max > own) over(output, (y * width + x) * 4, r, g, b, (max - own) * styles.outline.opacity);
      }
  }
  for (let i = 0; i < alpha.length; i += 1) over(output, i * 4, source[i * 4], source[i * 4 + 1], source[i * 4 + 2], source[i * 4 + 3]);
  return output;
}
