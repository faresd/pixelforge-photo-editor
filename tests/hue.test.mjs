import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateHue, rotateHuePixels } from '../src/hue.ts';

test('HSL hue rotation maps primary and secondary colours and wraps signed degrees', () => {
  assert.deepEqual(rotateHue(255, 0, 0, 120), [0, 255, 0]);
  assert.deepEqual(rotateHue(255, 0, 0, -120), [0, 0, 255]);
  assert.deepEqual(rotateHue(255, 0, 0, 180), [0, 255, 255]);
  assert.deepEqual(rotateHue(255, 0, 0, -180), [0, 255, 255]);
  assert.deepEqual(rotateHue(0, 255, 0, 120), [0, 0, 255]);
  assert.deepEqual(rotateHue(0, 0, 255, 120), [255, 0, 0]);
  assert.deepEqual(rotateHue(255, 255, 0, -60), [255, 0, 0]);
  assert.deepEqual(rotateHue(255, 0, 0, 480), [0, 255, 0]);
});

test('identity, grayscale and nonfinite rotations retain exact channels', () => {
  for (const degrees of [0, 360, -360, Number.NaN, Infinity, -Infinity])
    assert.deepEqual(rotateHue(97, 132, 204, degrees), [97, 132, 204]);
  for (const grey of [0, 1, 128, 254, 255])
    for (const degrees of [-180, -120, 60, 180])
      assert.deepEqual(rotateHue(grey, grey, grey, degrees), [grey, grey, grey]);
});

test('rotation preserves saturation and lightness for dark and light colours', () => {
  assert.deepEqual(rotateHue(128, 0, 0, 120), [0, 128, 0]);
  assert.deepEqual(rotateHue(255, 128, 128, 120), [128, 255, 128]);
  for (const colour of [[97, 132, 204], [234, 198, 178], [3, 52, 9]]) {
    const rotated = rotateHue(...colour, 137);
    assert.equal(Math.min(...rotated), Math.min(...colour));
    assert.equal(Math.max(...rotated), Math.max(...colour));
  }
});

test('pixel correction retains alpha and transparent RGB and is reversible within rounding', () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    128, 0, 0, 96,
    17, 33, 65, 0,
  ]);
  rotateHuePixels(pixels, 120);
  assert.deepEqual(Array.from(pixels), [0, 255, 0, 255, 0, 128, 0, 96, 17, 33, 65, 0]);
  rotateHuePixels(pixels, -120);
  assert.deepEqual(Array.from(pixels), [255, 0, 0, 255, 128, 0, 0, 96, 17, 33, 65, 0]);
});
