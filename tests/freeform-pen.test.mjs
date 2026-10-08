import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendFreeformPoint,
  buildFreeformPath,
  FREEFORM_MAX_POINTS,
} from '../src/freeformPen.ts';

const style = { strokeWidth: 3, fillColor: '#ffffff', strokeColor: '#112233' };

test('freeform sampling removes subpixel jitter and keeps caller points immutable', () => {
  const points = [{ x: 1, y: 2 }];
  const jitter = appendFreeformPoint(points, { x: 2, y: 2.5 });
  assert.deepEqual(jitter, points);
  const next = appendFreeformPoint(points, { x: 4, y: 2 });
  assert.deepEqual(next, [{ x: 1, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(points, [{ x: 1, y: 2 }]);
});

test('freeform paths are open editable cubic paths with deterministic handles', () => {
  const path = buildFreeformPath([{ x: 0, y: 0 }, { x: 60, y: 30 }, { x: 120, y: 0 }], style);
  assert.equal(path.closed, false);
  assert.equal(path.fill, false);
  assert.deepEqual(path.nodes[0].outHandle, { x: 10, y: 5 });
  assert.deepEqual(path.nodes[1].inHandle, { x: 40, y: 30 / 1 });
  assert.deepEqual(path.nodes[1].outHandle, { x: 80, y: 30 });
  assert.deepEqual(path.nodes[2].inHandle, { x: 110, y: 5 });
  assert.equal(path.strokeColor, '#112233');
});

test('freeform paths enforce bounded input before allocating handles', () => {
  assert.throws(() => buildFreeformPath([{ x: 1, y: 1 }], style), /2 to 5000/);
  assert.throws(() => buildFreeformPath([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }], style), /invalid/);
  const points = Array.from({ length: FREEFORM_MAX_POINTS }, (_, i) => ({ x: i * 3, y: 0 }));
  const capped = appendFreeformPoint(points, { x: FREEFORM_MAX_POINTS * 3, y: 0 });
  assert.equal(capped.length, FREEFORM_MAX_POINTS);
});
