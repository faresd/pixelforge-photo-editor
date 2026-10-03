import test from 'node:test';
import assert from 'node:assert/strict';
import { removeConnectedBackground } from '../src/backgroundRemoval.ts';

const rgba = (width, height, fn) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = fn(x, y);
      pixels.set(value, (y * width + x) * 4);
    }
  return pixels;
};

test('edge-connected backdrop is removed while an enclosed subject keeps alpha', () => {
  const pixels = rgba(5, 5, (x, y) =>
    x >= 1 && x <= 3 && y >= 1 && y <= 3
      ? [220, 40, 30, 255]
      : [20, 20, 20, 255],
  );
  const result = removeConnectedBackground(pixels, 5, 5, 0);
  assert.equal(result.removedPixels, 16);
  assert.equal(result.mask[(2 * 5 + 2) * 4 + 3], 255);
  assert.equal(result.mask[3], 0);
});

test('soft subject alpha is retained and transparent source pixels stay transparent', () => {
  const pixels = rgba(3, 3, (x, y) => {
    if (x === 1 && y === 1) return [200, 80, 40, 180];
    if (x === 1 && y === 0) return [200, 80, 40, 0];
    return [250, 250, 250, 255];
  });
  const result = removeConnectedBackground(pixels, 3, 3, 0);
  assert.equal(result.mask[(1 * 3 + 1) * 4 + 3], 180);
  assert.equal(result.mask[1 * 4 + 3], 0);
});

test('tolerance merges a lightly varied connected backdrop but preserves a contrasting island', () => {
  const pixels = rgba(4, 3, (x, y) => {
    if (x === 1 && y === 1) return [100, 100, 100, 255];
    if (x === 2 && y === 1) return [140, 140, 140, 255];
    return [100 + (x === 3 ? 3 : 0), 100, 100, 255];
  });
  const result = removeConnectedBackground(pixels, 4, 3, 8);
  assert.equal(result.mask[(1 * 4 + 1) * 4 + 3], 0);
  assert.equal(result.mask[(1 * 4 + 2) * 4 + 3], 255);
  assert.equal(result.removedPixels, 11);
});

test('invalid dimensions, buffers and tolerance fail closed', () => {
  assert.throws(
    () => removeConnectedBackground(new Uint8ClampedArray(4), 2, 2, 24),
    /pixel length/,
  );
  assert.throws(
    () => removeConnectedBackground(new Uint8ClampedArray(16), 2, 2, -1),
    /tolerance/,
  );
  assert.throws(
    () => removeConnectedBackground(new Uint8ClampedArray(16), 0, 2, 24),
    /dimensions/,
  );
});
