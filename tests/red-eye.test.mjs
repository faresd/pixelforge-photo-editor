import assert from 'node:assert/strict';
import test from 'node:test';
import { isRedEyePixel, redEyeCoverage, removeRedEye } from '../src/redEye.ts';

const rgba = (...pixels) => Uint8ClampedArray.from(pixels.flat());
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

test('red-eye classification is conservative and ignores transparent pixels', () => {
  assert.equal(isRedEyePixel(240, 30, 35, 255), true);
  assert.equal(isRedEyePixel(160, 120, 90, 255), false);
  assert.equal(isRedEyePixel(240, 30, 35, 0), false);
  assert.equal(isRedEyePixel(240, 30, 35, 255, 220), false);
});

test('coverage is bounded with a deterministic soft edge', () => {
  assert.equal(redEyeCoverage(0, 10), 1);
  assert.equal(redEyeCoverage(10, 10), 0);
  assert.ok(redEyeCoverage(9, 10) > 0);
  assert.ok(redEyeCoverage(9, 10) < 1);
});

test('removeRedEye neutralises only red-dominant pixels and preserves source/alpha', () => {
  const source = rgba(
    [240, 30, 35, 255],
    [40, 60, 80, 255],
    [235, 25, 30, 255],
    [1, 2, 3, 0],
    [200, 40, 40, 255],
    [40, 60, 80, 255],
  );
  const original = source.slice();
  const result = removeRedEye(source, {
    width: 3,
    height: 2,
    x: 0,
    y: 0,
    radius: 1.1,
  });
  assert.equal(result.changed, true);
  assert.ok(pixel(result.pixels, 3, 0, 0)[0] < 240);
  assert.deepEqual(pixel(result.pixels, 3, 1, 0), [40, 60, 80, 255]);
  assert.deepEqual(pixel(result.pixels, 3, 0, 1), [1, 2, 3, 0]);
  assert.deepEqual(pixel(result.pixels, 3, 1, 1), [200, 40, 40, 255]);
  assert.deepEqual(source, original);
  assert.equal(result.mask.length, 6);
  assert.ok(result.mask[0] > 0);
  assert.equal(result.mask[5], 0);
});

test('amount zero and threshold misses are immutable no-ops', () => {
  const source = rgba([240, 30, 35, 255], [40, 60, 80, 255]);
  const zero = removeRedEye(source, {
    width: 2,
    height: 1,
    x: 0,
    y: 0,
    radius: 4,
    amount: 0,
  });
  const miss = removeRedEye(source, {
    width: 2,
    height: 1,
    x: 0,
    y: 0,
    radius: 4,
    threshold: 255,
  });
  assert.equal(zero.changed, false);
  assert.equal(miss.changed, false);
  assert.deepEqual(zero.pixels, source);
  assert.deepEqual(miss.pixels, source);
  assert.notEqual(zero.pixels, source);
});

test('radius clips bounds and malformed inputs fail before output', () => {
  const source = rgba([240, 30, 35, 255]);
  const result = removeRedEye(source, {
    width: 1,
    height: 1,
    x: -20,
    y: -20,
    radius: 2,
  });
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(result.pixels, source);
  assert.throws(
    () => removeRedEye(source, { width: 0, height: 1, x: 0, y: 0, radius: 1 }),
    /dimensions/,
  );
  assert.throws(
    () =>
      removeRedEye(new Uint8ClampedArray(3), {
        width: 1,
        height: 1,
        x: 0,
        y: 0,
        radius: 1,
      }),
    /source/i,
  );
  assert.throws(
    () => removeRedEye(source, { width: 1, height: 1, x: 0, y: 0, radius: 0 }),
    /radius/,
  );
  assert.throws(
    () =>
      removeRedEye(source, {
        width: 1,
        height: 1,
        x: 0,
        y: 0,
        radius: 1,
        amount: 2,
      }),
    /amount/,
  );
});

test('replaying the same correction is byte deterministic', () => {
  const source = rgba(
    [245, 20, 25, 255],
    [220, 40, 40, 255],
    [30, 40, 50, 255],
  );
  const options = {
    width: 3,
    height: 1,
    x: 1,
    y: 0,
    radius: 2.5,
    amount: 0.63,
  };
  const first = removeRedEye(source, options);
  const second = removeRedEye(source, options);
  assert.deepEqual(first.pixels, second.pixels);
  assert.deepEqual(first.mask, second.mask);
});
