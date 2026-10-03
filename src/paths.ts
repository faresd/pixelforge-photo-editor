/**
 * Bounded straight-segment Pen path model.
 *
 * Paths stay editable metadata: node coordinates are local to their layer,
 * and rendering is responsible for applying the layer affine matrix. This
 * first slice intentionally has corner nodes only; Bézier handles and
 * boolean path operations remain separate contracts.
 */

export type PathNode = { x: number; y: number };

export type PathModel = {
  nodes: PathNode[];
  closed: boolean;
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
  fillColor: string;
  strokeColor: string;
};

export type PathMatrix = readonly [number, number, number, number, number, number];

export const PATH_MAX_NODES = 10_000;
export const PATH_MAX_COORDINATE = 1_000_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6,8}$/i.test(value);

const cloneNode = (node: PathNode): PathNode => ({ x: node.x, y: node.y });

const validateNode = (node: unknown): node is PathNode =>
  Boolean(node) &&
  typeof node === 'object' &&
  finite((node as PathNode).x) &&
  finite((node as PathNode).y) &&
  Math.abs((node as PathNode).x) <= PATH_MAX_COORDINATE &&
  Math.abs((node as PathNode).y) <= PATH_MAX_COORDINATE;

/** Return a cloned, validated model or throw a user-visible contract error. */
export function validatePath(value: unknown): PathModel {
  if (!value || typeof value !== 'object') throw new Error('Path must be an object');
  const path = value as Partial<PathModel>;
  if (!Array.isArray(path.nodes) || path.nodes.length < 1 || path.nodes.length > PATH_MAX_NODES)
    throw new Error(`Path must contain 1 to ${PATH_MAX_NODES} nodes`);
  if (!path.nodes.every(validateNode)) throw new Error('Path nodes are invalid');
  if (typeof path.closed !== 'boolean') throw new Error('Path closed state is invalid');
  if (typeof path.fill !== 'boolean' || typeof path.stroke !== 'boolean')
    throw new Error('Path appearance is invalid');
  if (!finite(path.strokeWidth) || path.strokeWidth < 0 || path.strokeWidth > 10_000)
    throw new Error('Path stroke width is invalid');
  if (!validColor(path.fillColor) || !validColor(path.strokeColor))
    throw new Error('Path colors are invalid');
  if (!path.fill && !path.stroke) throw new Error('Path needs a fill or stroke');
  return {
    nodes: path.nodes.map(cloneNode),
    closed: path.closed,
    fill: path.fill,
    stroke: path.stroke,
    strokeWidth: path.strokeWidth,
    fillColor: path.fillColor.toLowerCase(),
    strokeColor: path.strokeColor.toLowerCase(),
  };
}

export function clonePath(path: PathModel): PathModel {
  return validatePath(path);
}

export function pathBounds(path: PathModel): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const valid = validatePath(path);
  if (!valid.nodes.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const xs = valid.nodes.map((node) => node.x), ys = valid.nodes.map((node) => node.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function movePathNode(path: PathModel, index: number, x: number, y: number): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  const next = { ...valid, nodes: valid.nodes.map(cloneNode) };
  next.nodes[index] = { x, y };
  return validatePath(next);
}

export function transformPath(path: PathModel, matrix: PathMatrix): PathModel {
  const valid = validatePath(path);
  if (matrix.length !== 6 || !matrix.every(finite)) throw new Error('Path matrix is invalid');
  const [a, b, c, d, e, f] = matrix;
  return validatePath({
    ...valid,
    nodes: valid.nodes.map(({ x, y }) => ({ x: a * x + c * y + e, y: b * x + d * y + f })),
  });
}

const segmentDistance = (point: PathNode, start: PathNode, end: PathNode): number => {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};

/** Return the nearest node within radius, preferring the lowest index on ties. */
export function hitTestPathNode(path: PathModel, point: PathNode, radius: number): number | null {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(radius) || radius < 0) throw new Error('Path hit-test input is invalid');
  let match: number | null = null, best = radius;
  valid.nodes.forEach((node, index) => {
    const distance = Math.hypot(point.x - node.x, point.y - node.y);
    if (distance <= best) { best = distance; match = index; }
  });
  return match;
}

/** Return whether a point lies on a path stroke within the supplied tolerance. */
export function hitTestPathStroke(path: PathModel, point: PathNode, tolerance: number): boolean {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(tolerance) || tolerance < 0)
    throw new Error('Path hit-test input is invalid');
  for (let i = 1; i < valid.nodes.length; i += 1)
    if (segmentDistance(point, valid.nodes[i - 1], valid.nodes[i]) <= tolerance) return true;
  return Boolean(valid.closed && valid.nodes.length > 1 && segmentDistance(point, valid.nodes.at(-1)!, valid.nodes[0]) <= tolerance);
}

/** Stable SVG path data used for export/tests, with no locale-sensitive formatting. */
export function serializePathData(path: PathModel): string {
  const valid = validatePath(path);
  if (!valid.nodes.length) return '';
  const number = (value: number) => Number(value.toFixed(4)).toString();
  const first = valid.nodes[0];
  const commands = [`M ${number(first.x)} ${number(first.y)}`];
  for (const node of valid.nodes.slice(1)) commands.push(`L ${number(node.x)} ${number(node.y)}`);
  if (valid.closed) commands.push('Z');
  return commands.join(' ');
}
