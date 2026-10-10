import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendCurvaturePoint,
  buildCurvaturePath,
  CURVATURE_MAX_POINTS,
} from '../src/curvaturePen.ts';

const style = { strokeWidth: 4, fillColor: '#abcdef', strokeColor: '#102030' };

test('curvature sampling ignores jitter and keeps input immutable', () => {
  const points = [{ x: 2, y: 3 }];
  assert.deepEqual(appendCurvaturePoint(points, { x: 3, y: 3.5 }), points);
  assert.deepEqual(appendCurvaturePoint(points, { x: 8, y: 5 }), [
    { x: 2, y: 3 },
    { x: 8, y: 5 },
  ]);
  assert.deepEqual(points, [{ x: 2, y: 3 }]);
});

test('curvature paths create editable cubic handles and optional closure', () => {
  const open = buildCurvaturePath(
    [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 90, y: 0 }],
    style,
  );
  assert.equal(open.closed, false);
  assert.equal(open.fill, false);
  assert.ok(open.nodes.some((node) => node.inHandle || node.outHandle));
  const closed = buildCurvaturePath(
    [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 90, y: 0 }],
    style,
    true,
  );
  assert.equal(closed.closed, true);
  assert.equal(closed.fill, true);
  assert.equal(closed.strokeColor, '#102030');
});

test('curvature input is finite and bounded before handle allocation', () => {
  assert.throws(() => buildCurvaturePath([{ x: 0, y: 0 }], style), /2 to 1000/);
  assert.throws(
    () => buildCurvaturePath([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }], style),
    /invalid/,
  );
  const points = Array.from({ length: CURVATURE_MAX_POINTS }, (_, i) => ({ x: i * 3, y: 0 }));
  assert.equal(appendCurvaturePoint(points, { x: CURVATURE_MAX_POINTS * 3, y: 0 }).length, CURVATURE_MAX_POINTS);
});
