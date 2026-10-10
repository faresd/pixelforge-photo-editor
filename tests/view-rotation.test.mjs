import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasPointFromClient, normalizeViewRotation, rotationDelta, screenPanDelta } from '../src/viewRotation.ts';

test('view rotation normalizes angles and shortest pointer deltas', () => {
  assert.equal(normalizeViewRotation(0), 0);
  assert.equal(normalizeViewRotation(190), -170);
  assert.equal(normalizeViewRotation(-190), 170);
  assert.equal(normalizeViewRotation(360), 0);
  assert.equal(rotationDelta((179 * Math.PI) / 180, (-179 * Math.PI) / 180), 2);
  assert.equal(rotationDelta((-179 * Math.PI) / 180, (179 * Math.PI) / 180), -2);
});

test('view rotation maps client points back to canvas pixels around its centre', () => {
  const rect = { left: 50, top: 80, width: 200, height: 100 };
  assert.deepEqual(canvasPointFromClient(150, 130, rect, 200, 100, 400, 200, 0), { x: 200, y: 100 });
  const quarter = canvasPointFromClient(150, 30, { left: 100, top: 30, width: 100, height: 200 }, 200, 100, 400, 200, 90);
  assert.ok(Math.abs(quarter.x - 0) < 1e-9 && Math.abs(quarter.y - 100) < 1e-9);
  const point = canvasPointFromClient(100, 80, rect, 200, 100, 400, 200, 180);
  assert.deepEqual(point, { x: 300, y: 200 });
});

test('view rotation rejects malformed geometry and bearings', () => {
  assert.throws(() => normalizeViewRotation(Number.NaN), /finite/);
  assert.throws(() => rotationDelta(Number.NaN, 0), /finite/);
  assert.throws(() => canvasPointFromClient(0, 0, { left: 0, top: 0, width: 0, height: 1 }, 1, 1, 1, 1, 0), /dimensions/);
});

test('hand panning remains in screen space while the canvas is rotated', () => {
  assert.deepEqual(screenPanDelta(100, 200, 70, 145), { x: -30, y: -55 });
  assert.throws(() => screenPanDelta(Number.NaN, 0, 1, 1), /finite/);
});
