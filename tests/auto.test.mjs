import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_MODES,
  applyAutoAdjustmentsPixels,
  autoColorPixels,
  autoContrastPixels,
  autoTonePixels,
  effectiveAutoAdjustments,
  isNeutralAuto,
  neutralAuto,
  validAutoAdjustments,
} from '../src/auto.ts';

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());
const pixel = (pixels, index) =>
  Array.from(pixels.slice(index * 4, index * 4 + 4));

test('auto metadata normalizes legacy omissions and validates exact booleans', () => {
  assert.deepEqual(effectiveAutoAdjustments(undefined), neutralAuto);
  assert.deepEqual(effectiveAutoAdjustments({ tone: true }), {
    tone: true,
    contrast: false,
    color: false,
  });
  assert.equal(validAutoAdjustments(neutralAuto), true);
  assert.equal(
    validAutoAdjustments({ tone: true, contrast: false, color: true }),
    true,
  );
  for (const value of [
    null,
    {},
    { ...neutralAuto, tone: 1 },
    { ...neutralAuto, contrast: 'yes' },
    { ...neutralAuto, color: null },
    [],
  ])
    assert.equal(validAutoAdjustments(value), false);
  assert.equal(isNeutralAuto(undefined), true);
  assert.equal(isNeutralAuto({ color: true }), false);
  assert.deepEqual(AUTO_MODES, ['tone', 'contrast', 'color']);
});

test('Auto Tone stretches each visible channel and preserves alpha plus transparent RGB', () => {
  const source = rgba(
    [25, 40, 80, 255],
    [125, 90, 160, 128],
    [225, 140, 240, 255],
    [201, 33, 77, 0],
  );
  const original = source.slice();
  const output = autoTonePixels(source);
  assert.deepEqual(pixel(output, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(output, 2), [255, 255, 255, 255]);
  assert.equal(output[7], 128);
  assert.deepEqual(pixel(output, 3), [201, 33, 77, 0]);
  assert.deepEqual(source, original);
});

test('Auto Tone leaves flat channels and fully transparent images unchanged', () => {
  const flat = rgba([90, 110, 130, 64], [90, 110, 130, 255]);
  assert.deepEqual(autoTonePixels(flat), flat);
  const transparent = rgba([10, 20, 30, 0], [240, 230, 220, 0]);
  assert.deepEqual(autoTonePixels(transparent), transparent);
});

test('Auto Contrast uses one luminance range and keeps channels bounded', () => {
  const source = rgba(
    [30, 60, 90, 255],
    [80, 100, 120, 255],
    [180, 200, 220, 200],
    [10, 20, 30, 0],
  );
  const output = autoContrastPixels(source);
  assert.equal(output[3], 255);
  assert.equal(output[11], 200);
  assert.deepEqual(pixel(output, 3), [10, 20, 30, 0]);
  for (const channel of output) assert.ok(channel >= 0 && channel <= 255);
  assert.ok(output[0] < output[8]);
  assert.ok(output[1] < output[9]);
  assert.ok(output[2] < output[10]);
});

test('Auto Contrast is an identity for a flat luminance field', () => {
  const source = rgba([30, 60, 90, 255], [30, 60, 90, 255]);
  assert.deepEqual(autoContrastPixels(source), source);
});

test('Auto Color balances a channel cast with gray-world gains and preserves alpha', () => {
  const source = rgba(
    [180, 90, 60, 255],
    [120, 60, 40, 128],
    [20, 10, 6, 0],
  );
  const output = autoColorPixels(source);
  assert.equal(output[3], 255);
  assert.equal(output[7], 128);
  assert.deepEqual(pixel(output, 2), [20, 10, 6, 0]);
  const visibleMean = [0, 0, 0];
  for (const index of [0, 1])
    for (let channel = 0; channel < 3; channel += 1)
      visibleMean[channel] += output[index * 4 + channel];
  assert.ok(Math.max(...visibleMean) - Math.min(...visibleMean) <= 2);
});

test('combined modes use deterministic order and remain immutable/replayable', () => {
  const source = rgba(
    [40, 70, 100, 255],
    [80, 110, 140, 220],
    [200, 180, 160, 255],
    [1, 2, 3, 0],
  );
  const before = source.slice();
  const settings = { tone: true, contrast: true, color: true };
  const first = applyAutoAdjustmentsPixels(source, settings);
  const second = applyAutoAdjustmentsPixels(source, settings);
  assert.equal(first.changed, true);
  assert.deepEqual(first.data, second.data);
  assert.deepEqual(source, before);
  assert.deepEqual(pixel(first.data, 3), [1, 2, 3, 0]);
  assert.deepEqual(
    applyAutoAdjustmentsPixels(source, undefined),
    { data: source, changed: false },
  );
});

test('neutral or flat corrections report no change and return detached buffers', () => {
  const source = rgba([20, 30, 40, 255], [20, 30, 40, 255]);
  const neutral = applyAutoAdjustmentsPixels(source, neutralAuto);
  assert.equal(neutral.changed, false);
  assert.notStrictEqual(neutral.data, source);
  assert.deepEqual(neutral.data, source);
  assert.deepEqual(
    applyAutoAdjustmentsPixels(source, { tone: true }),
    { data: source, changed: false },
  );
});

test('invalid buffers and metadata fail before a correction can be applied', () => {
  assert.throws(
    () => applyAutoAdjustmentsPixels(new Uint8ClampedArray(3), neutralAuto),
    /complete RGBA/,
  );
  assert.throws(
    () => applyAutoAdjustmentsPixels(new Uint8ClampedArray(64_000_004), neutralAuto),
    /16 megapixel/,
  );
  assert.throws(
    () => applyAutoAdjustmentsPixels([0, 0, 0, 255], neutralAuto),
    /Uint8ClampedArray/,
  );
  assert.equal(
    validAutoAdjustments({ tone: true, contrast: false, color: false, extra: 1 }),
    true,
  );
  assert.equal(
    validAutoAdjustments({ tone: 'true', contrast: false, color: false }),
    false,
  );
});
