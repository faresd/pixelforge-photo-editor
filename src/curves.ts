/**
 * Nondestructive RGB curves. Curves are stored as small, sorted point lists
 * rather than a baked lookup table so the document can remain editable and
 * migrate the representation in the future.
 */

export const CURVE_CHANNELS = ['rgb', 'red', 'green', 'blue'] as const;
export type CurveChannel = (typeof CURVE_CHANNELS)[number];
export type CurvePoint = readonly [number, number];
export type CurvePoints = readonly CurvePoint[];
export type Curves = Record<CurveChannel, CurvePoints>;

export const identityCurve: CurvePoints = [
  [0, 0],
  [255, 255],
];

export const neutralCurves: Curves = {
  rgb: identityCurve,
  red: identityCurve,
  green: identityCurve,
  blue: identityCurve,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function point(value: unknown): CurvePoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = Number(value[0]),
    y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp(Math.round(x), 0, 255), clamp(Math.round(y), 0, 255)];
}

/** Normalize points into a deterministic bounded curve with endpoint anchors. */
export function normalizeCurvePoints(value: unknown): CurvePoints {
  const source = Array.isArray(value) ? value : [];
  const sorted = source
    .map(point)
    .filter((item): item is CurvePoint => !!item)
    .sort((a, b) => a[0] - b[0]);
  const deduped: CurvePoint[] = [];
  for (const item of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous[0] === item[0]) deduped[deduped.length - 1] = item;
    else deduped.push(item);
  }
  if (!deduped.length) return identityCurve;
  if (!deduped.length || deduped[0][0] !== 0) {
    deduped.unshift([0, deduped[0]?.[1] ?? 0]);
  } else {
    deduped[0] = [0, deduped[0][1]];
  }
  const last = deduped[deduped.length - 1];
  if (last[0] !== 255) deduped.push([255, last[1]]);
  else deduped[deduped.length - 1] = [255, last[1]];
  return deduped.length <= 33
    ? deduped
    : [deduped[0], ...deduped.slice(1, 32), deduped[deduped.length - 1]];
}

export function effectiveCurves(value: Partial<Curves> | undefined): Curves {
  return {
    rgb: normalizeCurvePoints(value?.rgb ?? identityCurve),
    red: normalizeCurvePoints(value?.red ?? identityCurve),
    green: normalizeCurvePoints(value?.green ?? identityCurve),
    blue: normalizeCurvePoints(value?.blue ?? identityCurve),
  };
}

export function validCurvePoints(value: unknown): value is CurvePoints {
  if (!Array.isArray(value) || value.length < 2 || value.length > 33)
    return false;
  let previous = -1;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return false;
    const x = item[0],
      y = item[1];
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 255 ||
      y < 0 ||
      y > 255 ||
      x <= previous
    )
      return false;
    previous = x;
  }
  return value[0][0] === 0 && value[value.length - 1][0] === 255;
}

export function validCurves(value: unknown): value is Curves {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Curves>;
  return CURVE_CHANNELS.every((channel) =>
    validCurvePoints(candidate[channel]),
  );
}

export function isNeutralCurves(value: Partial<Curves> | undefined): boolean {
  const curves = effectiveCurves(value);
  return CURVE_CHANNELS.every((channel) => {
    const points = curves[channel];
    return points.length === 2 && points[0][1] === 0 && points[1][1] === 255;
  });
}

/** Sample a curve with linear interpolation between adjacent control points. */
export function sampleCurve(points: CurvePoints, input: number): number {
  return sampleNormalizedCurve(normalizeCurvePoints(points), input);
}

function sampleNormalizedCurve(curve: CurvePoints, input: number): number {
  const x = clamp(Number.isFinite(input) ? input : 0, 0, 255);
  if (x <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index],
      left = curve[index - 1];
    if (x <= right[0]) {
      const span = Math.max(1, right[0] - left[0]);
      const ratio = (x - left[0]) / span;
      return clamp(Math.round(left[1] + (right[1] - left[1]) * ratio), 0, 255);
    }
  }
  return curve[curve.length - 1][1];
}

/** Compile once per render; pixel loops only need three bounded table lookups. */
export function compileCurves(
  curves: Partial<Curves> | undefined,
): Uint8Array[] {
  const value = effectiveCurves(curves);
  return ['red', 'green', 'blue'].map((channel) => {
    const table = new Uint8Array(256);
    for (let input = 0; input < 256; input += 1) {
      table[input] = sampleNormalizedCurve(
        value[channel as 'red' | 'green' | 'blue'],
        sampleNormalizedCurve(value.rgb, input),
      );
    }
    return table;
  });
}

export function curvesPixel(
  red: number,
  green: number,
  blue: number,
  curves: Partial<Curves> | undefined,
): [number, number, number] {
  const value = effectiveCurves(curves);
  const composite = [
    sampleCurve(value.rgb, red),
    sampleCurve(value.rgb, green),
    sampleCurve(value.rgb, blue),
  ];
  return [
    sampleCurve(value.red, composite[0]),
    sampleCurve(value.green, composite[1]),
    sampleCurve(value.blue, composite[2]),
  ];
}

/** Apply curves in-place, preserving alpha and transparent RGB data. */
export function applyCurvesPixels(
  data: Uint8ClampedArray,
  curves: Partial<Curves> | undefined,
): Uint8ClampedArray {
  if (isNeutralCurves(curves)) return data;
  const tables = compileCurves(curves);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    data[index] = tables[0][data[index]];
    data[index + 1] = tables[1][data[index + 1]];
    data[index + 2] = tables[2][data[index + 2]];
  }
  return data;
}

export function setCurvePoint(
  points: CurvePoints,
  x: number,
  y: number,
): CurvePoints {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return normalizeCurvePoints(points);
  const inputX = clamp(Math.round(x), 0, 255),
    inputY = clamp(Math.round(y), 0, 255),
    normalized = normalizeCurvePoints(points),
    existing = normalized.findIndex(([pointX]) => pointX === inputX);
  if (existing === 0 || existing === normalized.length - 1)
    return normalized.map((item, index) =>
      index === existing ? [item[0], inputY] : item,
    );
  if (existing >= 0)
    return normalized.map((item, index) =>
      index === existing ? [inputX, inputY] : item,
    );
  return normalizeCurvePoints([...normalized, [inputX, inputY]]);
}

/** Move one point without leaving a trail; endpoint input anchors stay fixed. */
export function moveCurvePoint(
  points: CurvePoints,
  sourceX: number,
  x: number,
  y: number,
): CurvePoints {
  const normalized = normalizeCurvePoints(points);
  if (![sourceX, x, y].every(Number.isFinite)) return normalized;
  const source = Math.round(sourceX);
  if (!normalized.some(([pointX]) => pointX === source)) return normalized;
  if (source === 0 || source === 255)
    return setCurvePoint(normalized, source, y);
  const destination = clamp(Math.round(x), 1, 254);
  return setCurvePoint(removeCurvePoint(normalized, source), destination, y);
}

export function removeCurvePoint(points: CurvePoints, x: number): CurvePoints {
  const normalized = normalizeCurvePoints(points),
    inputX = clamp(Math.round(x), 0, 255);
  if (inputX === 0 || inputX === 255) return normalized;
  return normalizeCurvePoints(
    normalized.filter(([pointX]) => pointX !== inputX),
  );
}
