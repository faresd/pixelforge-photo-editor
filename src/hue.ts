/** Rotate one RGB colour in HSL space, retaining saturation and lightness. */
export function rotateHue(
  red: number,
  green: number,
  blue: number,
  degrees: number,
): [number, number, number] {
  if (!Number.isFinite(degrees) || degrees % 360 === 0)
    return [red, green, blue];
  const r = red / 255,
    g = green / 255,
    b = blue / 255,
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (delta === 0) return [red, green, blue];
  const lightness = (max + min) / 2,
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  hue = (((hue * 60 + degrees) % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation,
    x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1)),
    m = lightness - chroma / 2;
  const rgb =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return rgb.map((value) => Math.round((value + m) * 255)) as [
    number,
    number,
    number,
  ];
}

/** Process a rendered buffer in-place; alpha and immutable source assets stay unchanged. */
export function rotateHuePixels(data: Uint8ClampedArray, degrees: number): void {
  if (!Number.isFinite(degrees) || degrees % 360 === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [red, green, blue] = rotateHue(data[i], data[i + 1], data[i + 2], degrees);
    data[i] = red;
    data[i + 1] = green;
    data[i + 2] = blue;
  }
}
