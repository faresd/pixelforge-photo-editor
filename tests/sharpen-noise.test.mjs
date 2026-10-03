import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySharpenNoisePixels,
  effectiveSharpenNoise,
  isNeutralSharpenNoise,
  neutralSharpenNoise,
  processSharpenNoisePixels,
  sharpenNoisePixels,
  validSharpenNoise,
} from '../src/sharpenNoise.ts';

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());

test('neutral settings are an exact no-op and the immutable helper preserves its source', () => {
  const source = rgba(
    [10, 20, 30, 255],
    [40, 50, 60, 128],
    [70, 80, 90, 0],
    [100, 110, 120, 255],
  );
  const before = new Uint8ClampedArray(source);
  applySharpenNoisePixels(source, 2, 2, neutralSharpenNoise);
  assert.deepEqual(source, before);
  const copy = sharpenNoisePixels(source, 2, 2, neutralSharpenNoise);
  assert.notStrictEqual(copy, source);
  assert.deepEqual(copy, source);
  assert.deepEqual(processSharpenNoisePixels(source, 2, 2), copy);
  assert.equal(isNeutralSharpenNoise(undefined), true);
  assert.equal(isNeutralSharpenNoise({ sharpen: 0, noise: 0 }), true);
});

test('normalization clamps bounds, rounds radius, and makes invalid values safe', () => {
  assert.deepEqual(
    effectiveSharpenNoise({
      sharpen: -4,
      radius: 2.6,
      threshold: 300,
      noise: 101,
      monochromatic: true,
      seed: -1.9,
    }),
    {
      sharpen: 0,
      radius: 3,
      threshold: 255,
      noise: 100,
      monochromatic: true,
      seed: 0xffffffff,
    },
  );
  assert.deepEqual(
    effectiveSharpenNoise({
      sharpenAmount: 25,
      noiseAmount: 30,
      radius: Number.NaN,
      threshold: Infinity,
      monochromatic: 'yes',
      seed: '42',
    }),
    { ...neutralSharpenNoise, sharpen: 25, noise: 30 },
  );
});

test('complete settings validate strictly and reject malformed ranges', () => {
  assert.equal(validSharpenNoise(neutralSharpenNoise), true);
  assert.equal(
    validSharpenNoise({ ...neutralSharpenNoise, seed: 0xffffffff }),
    true,
  );
  for (const value of [
    null,
    {},
    { ...neutralSharpenNoise, radius: 1.5 },
    { ...neutralSharpenNoise, sharpen: -1 },
    { ...neutralSharpenNoise, noise: 101 },
    { ...neutralSharpenNoise, seed: -1 },
    { ...neutralSharpenNoise, seed: 2 ** 32 },
    { ...neutralSharpenNoise, monochromatic: 1 },
  ])
    assert.equal(validSharpenNoise(value), false);
});

test('sharpen strengthens a high-contrast edge, leaves a flat field unchanged, and keeps alpha exact', () => {
  // A black / white edge in a three-pixel row.  Radius 1 gives each edge
  // pixel a neighbourhood average while the middle of each flat half stays
  // unchanged.
  const source = rgba(
    [64, 64, 64, 255],
    [96, 96, 96, 255],
    [160, 160, 160, 255],
    [192, 192, 192, 255],
  );
  const output = sharpenNoisePixels(source, 4, 1, {
    sharpen: 100,
    radius: 1,
    threshold: 0,
    noise: 0,
  });
  assert.deepEqual(
    Array.from(output),
    [48, 48, 48, 255, 85, 85, 85, 255, 171, 171, 171, 255, 208, 208, 208, 255],
  );

  const flat = rgba(
    [90, 90, 90, 255],
    [90, 90, 90, 255],
    [90, 90, 90, 255],
    [90, 90, 90, 255],
  );
  const flatBefore = new Uint8ClampedArray(flat);
  applySharpenNoisePixels(flat, 2, 2, { sharpen: 100, radius: 8 });
  assert.deepEqual(flat, flatBefore);

  const alpha = rgba([80, 80, 80, 0], [255, 0, 0, 96], [20, 30, 40, 17]);
  const alphaBefore = [alpha[3], alpha[7], alpha[11]];
  applySharpenNoisePixels(alpha, 3, 1, { sharpen: 100, radius: 1 });
  assert.deepEqual([alpha[3], alpha[7], alpha[11]], alphaBefore);
  assert.deepEqual(Array.from(alpha.slice(0, 4)), [80, 80, 80, 0]);
});

test('threshold suppresses low-contrast sharpening while allowing a larger edge', () => {
  const source = rgba(
    [100, 100, 100, 255],
    [110, 110, 110, 255],
    [130, 130, 130, 255],
  );
  const suppressed = sharpenNoisePixels(source, 3, 1, {
    sharpen: 100,
    radius: 1,
    threshold: 20,
  });
  const active = sharpenNoisePixels(source, 3, 1, {
    sharpen: 100,
    radius: 1,
    threshold: 0,
  });
  assert.deepEqual(Array.from(suppressed), Array.from(source));
  assert.notDeepEqual(Array.from(active), Array.from(source));
});

test('noise is deterministic by seed, supports monochrome mode, and never changes alpha', () => {
  const source = rgba(
    [100, 120, 140, 255],
    [10, 20, 30, 96],
    [1, 2, 3, 0],
    [200, 210, 220, 255],
  );
  const settings = { noise: 35, seed: 12345, monochromatic: false };
  const first = sharpenNoisePixels(source, 2, 2, settings);
  const second = sharpenNoisePixels(source, 2, 2, settings);
  assert.deepEqual(first, second);
  assert.deepEqual(
    Array.from(source),
    [100, 120, 140, 255, 10, 20, 30, 96, 1, 2, 3, 0, 200, 210, 220, 255],
  );
  assert.deepEqual(Array.from(first.slice(8, 12)), [1, 2, 3, 0]);
  assert.deepEqual(
    [first[3], first[7], first[11], first[15]],
    [255, 96, 0, 255],
  );
  assert.notDeepEqual(
    first,
    sharpenNoisePixels(source, 2, 2, { ...settings, seed: 12346 }),
  );

  const monochrome = sharpenNoisePixels(source, 2, 2, {
    noise: 35,
    seed: 12345,
    monochromatic: true,
  });
  assert.equal(monochrome[0] - source[0], monochrome[1] - source[1]);
  assert.equal(monochrome[1] - source[1], monochrome[2] - source[2]);
});

test('invalid dimensions and mismatched buffers fail before processing', () => {
  const data = rgba([0, 0, 0, 255]);
  for (const [width, height] of [
    [0, 1],
    [1, 0],
    [1.5, 1],
    [1, 2],
  ])
    assert.throws(
      () => applySharpenNoisePixels(data, width, height, { noise: 10 }),
      /dimensions|length/,
    );
  assert.throws(
    () => applySharpenNoisePixels(new Uint8Array(4), 1, 1, { noise: 10 }),
    /Uint8ClampedArray/,
  );
});

test('JSON round-trip retains a complete editable adjustment contract', () => {
  const settings = effectiveSharpenNoise({
    sharpen: 72,
    radius: 4,
    threshold: 17,
    noise: 12,
    monochromatic: true,
    seed: 0xdecafbad,
  });
  const restored = JSON.parse(JSON.stringify(settings));
  assert.deepEqual(restored, settings);
  assert.equal(validSharpenNoise(restored), true);
  assert.deepEqual(effectiveSharpenNoise(restored), settings);
});
