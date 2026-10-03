import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayerMaskPixels,
  effectiveLayerMask,
  invertMaskAlpha,
  neutralLayerMask,
  validLayerMask,
} from '../src/masks.ts';

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());

test('layer mask metadata defaults legacy drafts and rejects malformed values', () => {
  assert.deepEqual(effectiveLayerMask(undefined), neutralLayerMask);
  assert.deepEqual(effectiveLayerMask({ inverted: true }), {
    enabled: true,
    inverted: true,
  });
  assert.deepEqual(effectiveLayerMask({ enabled: false }), {
    enabled: false,
    inverted: false,
  });
  assert.equal(validLayerMask(neutralLayerMask), true);
  assert.equal(validLayerMask({ enabled: false, inverted: true }), true);
  for (const value of [
    null,
    {},
    [],
    { enabled: 1, inverted: false },
    { enabled: true, inverted: 'yes' },
    { enabled: true },
  ])
    assert.equal(validLayerMask(value), false);
});

test('mask alpha inversion is bounded, deterministic and immutable', () => {
  const source = new Uint8ClampedArray([0, 64, 128, 255, 255, 1]);
  const before = source.slice();
  assert.deepEqual(
    Array.from(invertMaskAlpha(source)),
    [255, 191, 127, 0, 0, 254],
  );
  assert.deepEqual(source, before);
});

test('enabled mask multiplies source alpha while preserving RGB and source', () => {
  const source = rgba([12, 24, 36, 255], [200, 100, 50, 128], [1, 2, 3, 0]);
  const before = source.slice();
  const output = applyLayerMaskPixels(source, [255, 128, 0]);
  assert.deepEqual(
    Array.from(output),
    [12, 24, 36, 255, 200, 100, 50, 64, 1, 2, 3, 0],
  );
  assert.deepEqual(source, before);
});

test('inverted mask complements alpha and remains nondestructive', () => {
  const source = rgba([1, 2, 3, 200], [4, 5, 6, 100]);
  const output = applyLayerMaskPixels(source, [255, 128], { inverted: true });
  assert.equal(output[3], 0);
  assert.equal(output[7], 50);
  assert.deepEqual(Array.from(source), [1, 2, 3, 200, 4, 5, 6, 100]);
});

test('disabled mask returns an exact copy without changing pixels', () => {
  const source = rgba([4, 5, 6, 200]);
  const output = applyLayerMaskPixels(source, [0], {
    enabled: false,
    inverted: true,
  });
  assert.deepEqual(output, source);
  assert.notEqual(output, source);
});

test('invalid pixel and mask lengths fail before mutation', () => {
  assert.throws(() => applyLayerMaskPixels([1, 2, 3], [255]), /RGBA/);
  assert.throws(
    () => applyLayerMaskPixels(new Uint8ClampedArray(8), [255]),
    /one value per pixel/,
  );
});
