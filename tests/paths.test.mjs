import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clonePath,
  hitTestPathHandle,
  hitTestPathNode,
  hitTestPathStroke,
  movePathHandle,
  movePathNode,
  pathBounds,
  serializePathData,
  transformPath,
  validatePath,
} from '../src/paths.ts';

const triangle = (patch = {}) => ({
  nodes: [{ x: 1, y: 2 }, { x: 8, y: 2 }, { x: 4, y: 7 }],
  closed: true,
  fill: true,
  stroke: true,
  strokeWidth: 2,
  fillColor: '#ff0000',
  strokeColor: '#000000',
  ...patch,
});

test('path validation clones nodes, normalizes colors, and rejects malformed bounds', () => {
  const raw = triangle();
  const path = validatePath(raw);
  raw.nodes[0].x = 99;
  assert.equal(path.nodes[0].x, 1);
  assert.equal(path.fillColor, '#ff0000');
  assert.throws(() => validatePath(triangle({ nodes: [] })), /1 to/);
  assert.throws(() => validatePath(triangle({ nodes: [{ x: 1e9, y: 0 }] })), /nodes/);
  assert.throws(() => validatePath(triangle({ fill: false, stroke: false })), /fill or stroke/);
  assert.throws(() => validatePath(triangle({ strokeWidth: -1 })), /stroke width/);
});

test('open and closed paths have deterministic bounds and SVG data', () => {
  const open = validatePath(triangle({ closed: false }));
  assert.deepEqual(pathBounds(open), { left: 1, top: 2, right: 8, bottom: 7, width: 7, height: 5 });
  assert.equal(serializePathData(open), 'M 1 2 L 8 2 L 4 7');
  assert.equal(serializePathData(triangle()), 'M 1 2 L 8 2 L 4 7 Z');
});

test('node hit testing is deterministic and stroke hit testing includes closing edge', () => {
  const path = validatePath(triangle());
  assert.equal(hitTestPathNode(path, { x: 1.2, y: 2.1 }, 1), 0);
  assert.equal(hitTestPathNode(path, { x: 4.5, y: 5.5 }, 0.2), null);
  assert.equal(hitTestPathStroke(path, { x: 4.5, y: 2 }, 0.6), true);
  assert.equal(hitTestPathStroke(path, { x: 3, y: 5 }, 0.3), true);
  assert.equal(hitTestPathStroke(validatePath({ ...path, closed: false }), { x: 3, y: 5 }, 0.3), false);
});

test('node hit testing chooses the lowest index on ties and includes the radius boundary', () => {
  const path = validatePath(triangle({ nodes: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 1, y: 2 }] }));
  assert.equal(hitTestPathNode(path, { x: 2, y: 2 }, 1), 0);
  assert.equal(hitTestPathNode(path, { x: 1, y: 2 }, 0), 0);
  assert.equal(hitTestPathNode(path, { x: 2, y: 2 }, 0.99), null);
});

test('moving a node returns an immutable validated path', () => {
  const path = validatePath(triangle());
  const moved = movePathNode(path, 1, 9, 4);
  assert.equal(path.nodes[1].x, 8);
  assert.deepEqual(moved.nodes[1], { x: 9, y: 4 });
  assert.throws(() => movePathNode(path, 10, 0, 0), /index/);
  assert.throws(() => movePathNode(path, 0, Number.NaN, 0), /nodes/);
});

test('affine transforms retain metadata and transform all nodes', () => {
  const path = validatePath(triangle({ fill: false }));
  const moved = transformPath(path, [2, 0, 0, 3, 10, -2]);
  assert.deepEqual(moved.nodes, [{ x: 12, y: 4 }, { x: 26, y: 4 }, { x: 18, y: 19 }]);
  assert.equal(moved.strokeColor, path.strokeColor);
  assert.equal(moved.fill, false);
  assert.deepEqual(clonePath(path), path);
  assert.throws(() => transformPath(path, [1, 0, 0, 1, Number.NaN, 0]), /matrix/);
});

test('serializing the same path twice is byte deterministic', () => {
  const path = validatePath(triangle({ nodes: [{ x: 1.123456, y: 2.345678 }, { x: 8, y: 2 }, { x: 4, y: 7 }] }));
  assert.equal(serializePathData(path), serializePathData(clonePath(path)));
});

test('cubic handles validate, serialize and round-trip without changing legacy nodes', () => {
  const curved = validatePath(triangle({
    nodes: [
      { x: 0, y: 0, outHandle: { x: 0, y: 100 } },
      { x: 100, y: 100, inHandle: { x: 100, y: 0 } },
    ],
    closed: false,
  }));
  assert.deepEqual(clonePath(curved), curved);
  assert.equal(serializePathData(curved), 'M 0 0 C 0 100 100 0 100 100');
  assert.throws(() => validatePath(triangle({ nodes: [{ x: 0, y: 0, inHandle: { x: Infinity, y: 0 } }] })), /nodes/);
  assert.throws(() => validatePath(triangle({ nodes: [{ x: 0, y: 0, outHandle: { x: 1e9, y: 0 } }] })), /nodes/);
});

test('cubic extrema and stroke hit testing follow curve geometry', () => {
  const curved = validatePath({
    nodes: [
      { x: 0, y: 0, outHandle: { x: 0, y: 100 } },
      { x: 100, y: 100, inHandle: { x: 100, y: 0 } },
    ],
    closed: false,
    fill: false,
    stroke: true,
    strokeWidth: 2,
    fillColor: '#ff0000',
    strokeColor: '#000000',
  });
  const bounds = pathBounds(curved);
  assert.equal(bounds.left, 0);
  assert.equal(bounds.right, 100);
  assert.equal(bounds.top, 0);
  assert.equal(bounds.bottom, 100);
  assert.equal(hitTestPathStroke(curved, { x: 50, y: 50 }, 2), true);
  assert.equal(hitTestPathStroke(curved, { x: 50, y: 5 }, 2), false);
});

test('Bezier handle hit testing and movement are immutable and deterministic', () => {
  const path = validatePath({
    nodes: [
      { x: 0, y: 0, outHandle: { x: 0, y: 100 } },
      { x: 100, y: 100, inHandle: { x: 100, y: 0 } },
    ],
    closed: false,
    fill: false,
    stroke: true,
    strokeWidth: 2,
    fillColor: '#ff0000',
    strokeColor: '#000000',
  });
  assert.deepEqual(hitTestPathHandle(path, { x: 1, y: 99 }, 2), { index: 0, kind: 'out' });
  assert.deepEqual(hitTestPathHandle(path, { x: 99, y: 1 }, 2), { index: 1, kind: 'in' });
  assert.equal(hitTestPathHandle(path, { x: 50, y: 50 }, 2), null);
  const moved = movePathHandle(path, 0, 'out', 20, 80);
  assert.deepEqual(path.nodes[0].outHandle, { x: 0, y: 100 });
  assert.deepEqual(moved.nodes[0], { x: 0, y: 0, outHandle: { x: 20, y: 80 } });
  assert.deepEqual(moved.nodes[1], path.nodes[1]);
  assert.throws(() => movePathHandle(path, 0, 'in', 1, 1), /not defined/);
  assert.throws(() => movePathHandle(path, 4, 'out', 1, 1), /index/);
});

test('moving and transforming a cubic anchor carries its handles', () => {
  const curved = validatePath({
    nodes: [
      { x: 10, y: 20, inHandle: { x: 5, y: 20 }, outHandle: { x: 15, y: 20 } },
      { x: 50, y: 20 },
    ],
    closed: false,
    fill: false,
    stroke: true,
    strokeWidth: 2,
    fillColor: '#ff0000',
    strokeColor: '#000000',
  });
  const moved = movePathNode(curved, 0, 20, 35);
  assert.deepEqual(moved.nodes[0], {
    x: 20,
    y: 35,
    inHandle: { x: 15, y: 35 },
    outHandle: { x: 25, y: 35 },
  });
  const transformed = transformPath(moved, [2, 0, 0, 2, 1, -1]);
  assert.deepEqual(transformed.nodes[0], {
    x: 41,
    y: 69,
    inHandle: { x: 31, y: 69 },
    outHandle: { x: 51, y: 69 },
  });
});
