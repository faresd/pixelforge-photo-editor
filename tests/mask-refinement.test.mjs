import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMaskRefinementPixels,
  validMaskRefinementStroke,
  validateMaskRefinementStrokes,
} from '../src/maskRefinement.ts';

const rgba = (width, height, alpha = 0) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4)
    pixels.set([17, 34, 51, alpha], index);
  return pixels;
};
const pixel = (pixels, width, x, y) =>
  Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const stroke = (overrides = {}) => ({
  version: 1,
  points: [{ x: 3, y: 3 }],
  size: 3,
  hardness: 100,
  opacity: 1,
  mode: 'reveal',
  ...overrides,
});

test('mask brush reveals alpha only and leaves the detached source untouched', () => {
  const source = rgba(7, 7, 20);
  source.set([240, 1, 2, 0], (3 * 7 + 3) * 4);
  const before = source.slice();
  const result = applyMaskRefinementPixels(source, 7, 7, stroke());
  assert.deepEqual(source, before);
  assert.equal(pixel(result.pixels, 7, 3, 3)[3], 255);
  assert.deepEqual(pixel(result.pixels, 7, 3, 3).slice(0, 3), [240, 1, 2]);
  assert.equal(result.changed, true);
  assert.deepEqual(pixel(result.pixels, 7, 0, 0), [17, 34, 51, 20]);
});

test('mask eraser conceals alpha, clips at edges and interpolates a stroke', () => {
  const result = applyMaskRefinementPixels(
    rgba(8, 4, 220),
    8,
    4,
    stroke({
      points: [{ x: 0, y: 0 }, { x: 7, y: 3 }],
      size: 4,
      hardness: 0,
      opacity: 0.8,
      mode: 'conceal',
    }),
  );
  assert.equal(result.changed, true);
  assert.ok(pixel(result.pixels, 8, 0, 0)[3] < 220);
  assert.ok(pixel(result.pixels, 8, 4, 2)[3] < 220);
  assert.equal(pixel(result.pixels, 8, 7, 3)[3] < 220, true);
  assert.deepEqual(pixel(result.pixels, 8, 7, 0), [17, 34, 51, 220]);
});

test('mask refinement is deterministic and no-op when coverage is already at the target', () => {
  const source = rgba(5, 5, 255);
  const noOp = applyMaskRefinementPixels(source, 5, 5, stroke());
  assert.equal(noOp.changed, false);
  const first = applyMaskRefinementPixels(
    rgba(5, 5, 0),
    5,
    5,
    stroke({ opacity: 0.4, hardness: 40, points: [{ x: 0, y: 2 }, { x: 4, y: 2 }] }),
  );
  const second = applyMaskRefinementPixels(
    rgba(5, 5, 0),
    5,
    5,
    stroke({ opacity: 0.4, hardness: 40, points: [{ x: 0, y: 2 }, { x: 4, y: 2 }] }),
  );
  assert.deepEqual(first, second);
});

test('validation rejects malformed modes, points, dimensions and oversized lists', () => {
  assert.equal(validMaskRefinementStroke(stroke()), true);
  assert.equal(validateMaskRefinementStrokes([stroke(), stroke()]), true);
  assert.equal(validMaskRefinementStroke({ ...stroke(), version: 2 }), false);
  assert.equal(validMaskRefinementStroke({ ...stroke(), mode: 'replace' }), false);
  assert.equal(validMaskRefinementStroke({ ...stroke(), opacity: 2 }), false);
  assert.equal(validMaskRefinementStroke({ ...stroke(), points: [] }), false);
  assert.equal(validMaskRefinementStroke({ ...stroke(), points: [{ x: 1, y: 1, pressure: 2 }] }), false);
  assert.equal(validateMaskRefinementStrokes(Array.from({ length: 129 }, () => stroke())), false);
  assert.throws(
    () => applyMaskRefinementPixels(new Uint8ClampedArray(4), 2, 2, stroke()),
    /RGBA/,
  );
  assert.throws(
    () => applyMaskRefinementPixels(rgba(2, 2), 16001, 2, stroke()),
    /dimensions/,
  );
});
