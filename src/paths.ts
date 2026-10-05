/**
 * Bounded editable Pen path model.
 *
 * A node can carry optional cubic Bezier handles. Handles are stored in the
 * same local coordinate system as the anchor, so transforms and direct node
 * edits remain nondestructive and round-trip through the document format.
 */

export type PathNode = {
  x: number;
  y: number;
  /** Incoming/outgoing cubic controls, when the node is curved. */
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
};

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

const clonePoint = (point: { x: number; y: number }) => ({ x: point.x, y: point.y });

const validPoint = (point: unknown): point is { x: number; y: number } =>
  Boolean(point) &&
  typeof point === 'object' &&
  finite((point as { x?: unknown }).x) &&
  finite((point as { y?: unknown }).y) &&
  Math.abs((point as { x: number }).x) <= PATH_MAX_COORDINATE &&
  Math.abs((point as { y: number }).y) <= PATH_MAX_COORDINATE;

const cloneNode = (node: PathNode): PathNode => ({
  x: node.x,
  y: node.y,
  ...(node.inHandle ? { inHandle: clonePoint(node.inHandle) } : {}),
  ...(node.outHandle ? { outHandle: clonePoint(node.outHandle) } : {}),
});

const validateNode = (node: unknown): node is PathNode => {
  if (!validPoint(node)) return false;
  const candidate = node as PathNode;
  return (
    (candidate.inHandle === undefined || validPoint(candidate.inHandle)) &&
    (candidate.outHandle === undefined || validPoint(candidate.outHandle))
  );
};

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

type Segment = { start: PathNode; end: PathNode; close: boolean };

const segments = (path: PathModel): Segment[] => {
  const result: Segment[] = [];
  for (let i = 1; i < path.nodes.length; i += 1)
    result.push({ start: path.nodes[i - 1], end: path.nodes[i], close: false });
  if (path.closed && path.nodes.length > 1)
    result.push({ start: path.nodes[path.nodes.length - 1], end: path.nodes[0], close: true });
  return result;
};

const controlPoints = (segment: Segment): [PathNode, PathNode, PathNode, PathNode] => [
  segment.start,
  segment.start.outHandle ?? segment.start,
  segment.end.inHandle ?? segment.end,
  segment.end,
];

const cubic = (p0: PathNode, p1: PathNode, p2: PathNode, p3: PathNode, t: number): PathNode => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

const extrema = (p0: number, p1: number, p2: number, p3: number): number[] => {
  const values = [0, 1];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) values.push(t);
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const t1 = (-b + root) / (2 * a), t2 = (-b - root) / (2 * a);
      if (t1 > 0 && t1 < 1) values.push(t1);
      if (t2 > 0 && t2 < 1) values.push(t2);
    }
  }
  return values;
};

/** Bounds include cubic extrema, rather than only anchors or control points. */
export function pathBounds(path: PathModel): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const valid = validatePath(path);
  if (!valid.nodes.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const points: PathNode[] = [];
  for (const segment of segments(valid)) {
    const [p0, p1, p2, p3] = controlPoints(segment);
    const ts = [...new Set([...extrema(p0.x, p1.x, p2.x, p3.x), ...extrema(p0.y, p1.y, p2.y, p3.y)])];
    points.push(...ts.map((t) => cubic(p0, p1, p2, p3, t)));
  }
  if (!points.length) points.push(...valid.nodes);
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Move an anchor and its handles together, preserving the local curve shape. */
export function movePathNode(path: PathModel, index: number, x: number, y: number): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  if (!finite(x) || !finite(y)) throw new Error('Path nodes are invalid');
  const node = valid.nodes[index];
  const dx = x - node.x, dy = y - node.y;
  const moved = (point?: { x: number; y: number }) =>
    point ? { x: point.x + dx, y: point.y + dy } : undefined;
  const next = {
    ...valid,
    nodes: valid.nodes.map((item, itemIndex) =>
      itemIndex === index
        ? { x, y, inHandle: moved(item.inHandle), outHandle: moved(item.outHandle) }
        : cloneNode(item),
    ),
  };
  return validatePath(next);
}

export function transformPath(path: PathModel, matrix: PathMatrix): PathModel {
  const valid = validatePath(path);
  if (matrix.length !== 6 || !matrix.every(finite)) throw new Error('Path matrix is invalid');
  const [a, b, c, d, e, f] = matrix;
  const transform = (point: { x: number; y: number }) => ({
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  });
  return validatePath({ ...valid, nodes: valid.nodes.map((node) => ({
    ...transform(node),
    ...(node.inHandle ? { inHandle: transform(node.inHandle) } : {}),
    ...(node.outHandle ? { outHandle: transform(node.outHandle) } : {}),
  })) });
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
    if (distance < best || (match === null && distance <= best)) { best = distance; match = index; }
  });
  return match;
}

/** Return whether a point lies on a straight or cubic path stroke. */
export function hitTestPathStroke(path: PathModel, point: PathNode, tolerance: number): boolean {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(tolerance) || tolerance < 0)
    throw new Error('Path hit-test input is invalid');
  for (const segment of segments(valid)) {
    const [p0, p1, p2, p3] = controlPoints(segment);
    let previous = p0;
    for (let step = 1; step <= 32; step += 1) {
      const next = cubic(p0, p1, p2, p3, step / 32);
      if (segmentDistance(point, previous, next) <= tolerance) return true;
      previous = next;
    }
  }
  return false;
}

/** Stable SVG path data used for export/tests, with no locale-sensitive formatting. */
export function serializePathData(path: PathModel): string {
  const valid = validatePath(path);
  if (!valid.nodes.length) return '';
  const number = (value: number) => Number(value.toFixed(4)).toString();
  const point = (value: PathNode) => `${number(value.x)} ${number(value.y)}`;
  const commands = [`M ${point(valid.nodes[0])}`];
  for (const segment of segments(valid)) {
    const [p0, p1, p2, p3] = controlPoints(segment);
    if (segment.close && !segment.start.outHandle && !segment.end.inHandle) {
      commands.push('Z');
      continue;
    }
    if (p1 !== p0 || p2 !== p3 || segment.start.outHandle || segment.end.inHandle)
      commands.push(`C ${point(p1)} ${point(p2)} ${point(p3)}`);
    else commands.push(`L ${point(p3)}`);
    if (segment.close) commands.push('Z');
  }
  return commands.join(' ');
}
