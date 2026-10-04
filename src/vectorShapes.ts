/** Deterministic geometry shared by editable parametric shape rendering/tests. */
export type ParametricShapeVariant = 'polygon' | 'triangle' | 'star';
export type ShapePoint = { x: number; y: number };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function validateShapeVariant(value: unknown): ParametricShapeVariant {
  if (value === undefined || value === 'polygon') return 'polygon';
  if (value === 'triangle' || value === 'star') return value;
  throw new Error('Shape variant is invalid');
}

/** Return clockwise vertices centred in a local layer box. */
export function shapePoints(
  width: number,
  height: number,
  variant: ParametricShapeVariant = 'polygon',
  sides = 5,
): ShapePoint[] {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0)
    throw new Error('Shape dimensions are invalid');
  const normalized = validateShapeVariant(variant);
  if (!Number.isInteger(sides) || sides < 3 || sides > 32)
    throw new Error('Shape sides are invalid');
  const count = normalized === 'triangle' ? 3 : normalized === 'star' ? sides * 2 : sides;
  const points: ShapePoint[] = [];
  const cx = width / 2, cy = height / 2, rx = width / 2, ry = height / 2;
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const radius = normalized === 'star' && index % 2 === 1 ? 0.5 : 1;
    points.push({ x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius });
  }
  return points;
}

export function shapeBounds(points: readonly ShapePoint[]) {
  if (!points.length) throw new Error('Shape needs points');
  if (!points.every((point) => finite(point.x) && finite(point.y)))
    throw new Error('Shape points are invalid');
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
