/**
 * Deterministic, nondestructive RGB color-balance correction.
 *
 * Values use Photoshop-style signed percentages: positive cyan/red moves
 * toward red, positive magenta/green toward green, and positive yellow/blue
 * toward blue. The operation is deliberately local and keeps alpha intact;
 * callers can apply it to a rendered buffer while retaining immutable source
 * pixels and editable adjustment metadata.
 */
export type ColorBalance = {
  shadowsCyanRed: number;
  shadowsMagentaGreen: number;
  shadowsYellowBlue: number;
  midtonesCyanRed: number;
  midtonesMagentaGreen: number;
  midtonesYellowBlue: number;
  highlightsCyanRed: number;
  highlightsMagentaGreen: number;
  highlightsYellowBlue: number;
  preserveLuminosity: boolean;
};

export const neutralColorBalance: ColorBalance = {
  shadowsCyanRed: 0,
  shadowsMagentaGreen: 0,
  shadowsYellowBlue: 0,
  midtonesCyanRed: 0,
  midtonesMagentaGreen: 0,
  midtonesYellowBlue: 0,
  highlightsCyanRed: 0,
  highlightsMagentaGreen: 0,
  highlightsYellowBlue: 0,
  preserveLuminosity: true,
};

const clamp = (value: number, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Normalize old/partial documents into the complete color-balance contract. */
export function effectiveColorBalance(
  value: Partial<ColorBalance> | undefined,
): ColorBalance {
  return {
    ...neutralColorBalance,
    ...value,
  };
}

/** True when the correction leaves every rendered channel unchanged. */
export function isNeutralColorBalance(
  value: Partial<ColorBalance> | undefined,
): boolean {
  const a = effectiveColorBalance(value);
  return (
    a.shadowsCyanRed === 0 &&
    a.shadowsMagentaGreen === 0 &&
    a.shadowsYellowBlue === 0 &&
    a.midtonesCyanRed === 0 &&
    a.midtonesMagentaGreen === 0 &&
    a.midtonesYellowBlue === 0 &&
    a.highlightsCyanRed === 0 &&
    a.highlightsMagentaGreen === 0 &&
    a.highlightsYellowBlue === 0
  );
}

/** Validate the persisted color-balance range before rendering or importing. */
export function validColorBalance(value: unknown): value is ColorBalance {
  if (!value || typeof value !== 'object') return false;
  const a = value as Partial<ColorBalance>;
  return (
    typeof a.preserveLuminosity === 'boolean' &&
    [
      a.shadowsCyanRed,
      a.shadowsMagentaGreen,
      a.shadowsYellowBlue,
      a.midtonesCyanRed,
      a.midtonesMagentaGreen,
      a.midtonesYellowBlue,
      a.highlightsCyanRed,
      a.highlightsMagentaGreen,
      a.highlightsYellowBlue,
    ].every((entry) => finite(entry) && entry >= -100 && entry <= 100)
  );
}

/**
 * Return tonal-range weights for a normalized luminance value.
 * The overlapping smooth bands avoid hard seams at shadow/highlight borders.
 */
function rangeWeights(luminance: number): [number, number, number] {
  const shadow = 1 - Math.min(1, luminance * 2.2);
  const highlight = Math.max(0, Math.min(1, (luminance - 0.45) * 1.9));
  const midtone = Math.max(0, 1 - Math.abs(luminance - 0.5) * 2.2);
  return [shadow * shadow, midtone * midtone, highlight * highlight];
}

/** Apply one color-balance correction while retaining alpha and bounded RGB. */
export function colorBalancePixel(
  red: number,
  green: number,
  blue: number,
  settings: Partial<ColorBalance> | undefined,
): [number, number, number] {
  const a = effectiveColorBalance(settings);
  if (isNeutralColorBalance(a)) return [red, green, blue];
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const [shadowWeight, midtoneWeight, highlightWeight] = rangeWeights(luminance);
  const cyanRed =
    (a.shadowsCyanRed * shadowWeight +
      a.midtonesCyanRed * midtoneWeight +
      a.highlightsCyanRed * highlightWeight) /
    100;
  const magentaGreen =
    (a.shadowsMagentaGreen * shadowWeight +
      a.midtonesMagentaGreen * midtoneWeight +
      a.highlightsMagentaGreen * highlightWeight) /
    100;
  const yellowBlue =
    (a.shadowsYellowBlue * shadowWeight +
      a.midtonesYellowBlue * midtoneWeight +
      a.highlightsYellowBlue * highlightWeight) /
    100;
  const sourceLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  let nextRed = clamp(red + cyanRed * 96);
  let nextGreen = clamp(green + magentaGreen * 96);
  let nextBlue = clamp(blue + yellowBlue * 96);
  if (a.preserveLuminosity) {
    const nextLuminance = 0.2126 * nextRed + 0.7152 * nextGreen + 0.0722 * nextBlue;
    if (nextLuminance > 0.0001) {
      const scale = sourceLuminance / nextLuminance;
      nextRed = clamp(nextRed * scale);
      nextGreen = clamp(nextGreen * scale);
      nextBlue = clamp(nextBlue * scale);
    }
  }
  return [Math.round(nextRed), Math.round(nextGreen), Math.round(nextBlue)];
}

/** Apply color balance in-place to an RGBA buffer; transparent RGB is untouched. */
export function applyColorBalancePixels(
  data: Uint8ClampedArray,
  settings: Partial<ColorBalance> | undefined,
): void {
  if (isNeutralColorBalance(settings)) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [red, green, blue] = colorBalancePixel(
      data[i],
      data[i + 1],
      data[i + 2],
      settings,
    );
    data[i] = red;
    data[i + 1] = green;
    data[i + 2] = blue;
  }
}
