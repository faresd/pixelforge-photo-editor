import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identity,
  layerTransformMatrix,
  multiply,
  validMatrix,
} from '../src/document.ts';

const bounds = { x: 10, y: 20, width: 80, height: 40 };
const values = {
  offsetX: 12,
  offsetY: -8,
  scaleX: 150,
  scaleY: 75,
  angle: 90,
  skewX: 0,
  skewY: 0,
  flipX: false,
  flipY: false,
};

test('layer transform produces a valid centre-preserving affine delta', () => {
  const delta = layerTransformMatrix(bounds, identity(), values);
  assert.equal(validMatrix(delta), true);
  // The painted centre (50, 40) should move only by the requested offset.
  const x = delta[0] * 50 + delta[2] * 40 + delta[4];
  const y = delta[1] * 50 + delta[3] * 40 + delta[5];
  assert.ok(Math.abs(x - 62) < 1e-9);
  assert.ok(Math.abs(y - 32) < 1e-9);
});

test('layer transform composes with existing translation without baking source pixels', () => {
  const existing = [1, 0, 0, 1, 100, 60];
  const delta = layerTransformMatrix(bounds, existing, {
    ...values,
    offsetX: 0,
    offsetY: 0,
    scaleX: 100,
    scaleY: 100,
    angle: 0,
  });
  assert.deepEqual(delta, identity());
  assert.deepEqual(multiply(delta, existing), existing);
  // A second transform changes metadata only; it never alters an asset URL.
});

test('layer transform rejects malformed bounds and collapsed scale', () => {
  assert.throws(
    () => layerTransformMatrix({ ...bounds, width: 0 }, identity(), values),
    /bounds are invalid/,
  );
  assert.throws(
    () =>
      layerTransformMatrix(bounds, identity(), {
        ...values,
        scaleX: 0,
      }),
    /valid transform values/,
  );
});
