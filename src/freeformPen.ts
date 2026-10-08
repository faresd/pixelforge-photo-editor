import { validatePath, type PathModel, type PathNode } from './paths.ts';

export const FREEFORM_MIN_DISTANCE = 2;
export const FREEFORM_MAX_POINTS = 5000;

const finitePoint = (point: PathNode) =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

/** Keep freehand sampling bounded and remove pointer-event jitter deterministically. */
export function appendFreeformPoint(points: readonly PathNode[], point: PathNode): PathNode[] {
  if (!finitePoint(point)) throw new Error('Freeform point is invalid');
  if (points.length >= FREEFORM_MAX_POINTS) return points.map(({ x, y }) => ({ x, y }));
  const last = points[points.length - 1];
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < FREEFORM_MIN_DISTANCE)
    return points.map(({ x, y }) => ({ x, y }));
  return [...points.map(({ x, y }) => ({ x, y })), { x: point.x, y: point.y }];
}

/** Build a smooth, editable open cubic path from sampled pointer points. */
export function buildFreeformPath(
  points: readonly PathNode[],
  style: Pick<PathModel, 'strokeWidth' | 'fillColor' | 'strokeColor'>,
): PathModel {
  if (points.length < 2 || points.length > FREEFORM_MAX_POINTS)
    throw new Error('Freeform path must contain 2 to 5000 points');
  if (!points.every(finitePoint)) throw new Error('Freeform points are invalid');
  const nodes = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = (next.x - previous.x) / 6;
    const dy = (next.y - previous.y) / 6;
    return {
      x: point.x,
      y: point.y,
      ...(index > 0 ? { inHandle: { x: point.x - dx, y: point.y - dy } } : {}),
      ...(index < points.length - 1 ? { outHandle: { x: point.x + dx, y: point.y + dy } } : {}),
    };
  });
  return validatePath({
    nodes,
    closed: false,
    fill: false,
    stroke: true,
    strokeWidth: style.strokeWidth,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
  });
}
