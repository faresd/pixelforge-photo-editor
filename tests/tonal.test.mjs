import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDodgeBurnStroke,
  applySpongeStroke,
  dodgeBurnStroke,
  spongeStroke,
} from '../src/tonal.ts';

const rgba = (width, height, color = [0, 0, 0, 255]) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) pixels.set(color, index * 4);
  return pixels;
};
const pixel = (pixels, width, x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x + 1) * 4));
const base = (extra = {}) => ({
  width: 7, height: 3, x1: 3, y1: 1, x2: 3, y2: 1, size: 7, hardness: 100,
  exposure: 0.5, flow: 1, range: 'midtones', mode: 'dodge', ...extra,
});

test('Dodge brightens RGB toward white while preserving alpha and source bytes', () => {
  const source = rgba(7, 3, [40, 80, 120, 180]);
  const original = source.slice();
  const result = applyDodgeBurnStroke(source, source, base());
  const after = pixel(result.pixels, 7, 3, 1);
  assert.ok(after[0] > 40 && after[1] > 80 && after[2] > 120);
  assert.equal(after[3], 180);
  assert.deepEqual(source, original);
  assert.equal(result.changed, true);
});

test('Burn darkens RGB toward black and does not touch transparent edges', () => {
  const source = rgba(3, 1, [150, 120, 90, 255]);
  source.set([220, 20, 30, 0], 0);
  const result = applyDodgeBurnStroke(source, source, base({ width: 3, height: 1, x1: 1, y1: 0, x2: 1, y2: 0, mode: 'burn', size: 3 }));
  const after = pixel(result.pixels, 3, 1, 0);
  assert.ok(after[0] < 150 && after[1] < 120 && after[2] < 90);
  assert.deepEqual(pixel(result.pixels, 3, 1, 0).slice(3), [255]);
  assert.deepEqual(pixel(result.pixels, 3, 0, 0), [220, 20, 30, 0]);
});

test('Dodge and Burn range masks target shadows, midtones and highlights deterministically', () => {
  const source = new Uint8ClampedArray([
    30, 30, 30, 255,
    128, 128, 128, 255,
    235, 235, 235, 255,
  ]);
  const shadow = applyDodgeBurnStroke(source, source, { ...base({ width: 3, height: 1, x1: 1, y1: 0, x2: 1, y2: 0, size: 9, range: 'shadows' }) });
  const midtone = applyDodgeBurnStroke(source, source, { ...base({ width: 3, height: 1, x1: 1, y1: 0, x2: 1, y2: 0, size: 9, range: 'midtones' }) });
  const highlight = applyDodgeBurnStroke(source, source, { ...base({ width: 3, height: 1, x1: 1, y1: 0, x2: 1, y2: 0, size: 9, range: 'highlights' }) });
  assert.ok(shadow.pixels[0] > source[0]);
  assert.ok(shadow.pixels[8] - source[8] < 2);
  assert.ok(midtone.pixels[4] > source[4]);
  assert.ok(highlight.pixels[8] > source[8]);
  assert.ok(highlight.pixels[0] - source[0] < 2);
});

test('exposure, flow, hardness and clipped radial coverage are bounded', () => {
  const source = rgba(5, 4, [80, 80, 80, 255]);
  const zero = applyDodgeBurnStroke(source, source, base({ width: 5, height: 4, x1: -2, y1: -1, x2: -2, y2: -1, size: 9, exposure: 0, flow: 0 }));
  assert.equal(zero.changed, false);
  assert.deepEqual(zero.pixels, source);
  const clipped = applyDodgeBurnStroke(source, source, base({ width: 5, height: 4, x1: -2, y1: -1, x2: -2, y2: -1, size: 9 }));
  assert.equal(clipped.mask.length, 20);
  assert.equal(clipped.mask.some(Boolean), true);
  assert.equal(clipped.mask.every((value) => value >= 0 && value <= 255), true);
  const soft = applyDodgeBurnStroke(source, source, base({ width: 5, height: 4, x1: 2, y1: 2, x2: 2, y2: 2, size: 5, hardness: 0 }));
  const hard = applyDodgeBurnStroke(source, source, base({ width: 5, height: 4, x1: 2, y1: 2, x2: 2, y2: 2, size: 5, hardness: 100 }));
  assert.ok(soft.mask.some((value) => value > 0 && value < 255));
  assert.ok(hard.mask.filter(Boolean).length >= soft.mask.filter(Boolean).length);
});

test('Sponge saturation raises chroma, desaturation lowers it, and alpha remains byte-identical', () => {
  const source = new Uint8ClampedArray([
    130, 100, 90, 201,
    30, 200, 80, 72,
  ]);
  const saturated = applySpongeStroke(source, source, { ...base({ width: 2, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 1 }), amount: 1, mode: 'saturate' });
  const desaturated = applySpongeStroke(source, source, { ...base({ width: 2, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 1 }), amount: 1, mode: 'desaturate' });
  const saturatedPixel = pixel(saturated.pixels, 2, 0, 0);
  const desaturatedPixel = pixel(desaturated.pixels, 2, 0, 0);
  assert.ok(Math.max(...saturatedPixel.slice(0, 3)) - Math.min(...saturatedPixel.slice(0, 3)) >=  Math.max(130, 100, 90) - Math.min(130, 100, 90));
  assert.ok(Math.max(...desaturatedPixel.slice(0, 3)) - Math.min(...desaturatedPixel.slice(0, 3)) <= 40);
  assert.equal(saturatedPixel[3], 201);
  assert.equal(desaturatedPixel[3], 201);
  assert.deepEqual(source, new Uint8ClampedArray([130, 100, 90, 201, 30, 200, 80, 72]));
});

for (const mode of ['saturate', 'desaturate']) test(`Sponge ${mode} flow scales vibrance strength while preserving alpha`, () => {
  const source = new Uint8ClampedArray([130, 100, 90, 201]);
  const full = applySpongeStroke(source, source, {
    ...base({ width: 1, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 1 }),
    amount: 1,
    flow: 1,
    mode,
  });
  const low = applySpongeStroke(source, source, {
    ...base({ width: 1, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 1 }),
    amount: 1,
    flow: 0.2,
    mode,
  });
  const spread = (pixels) => Math.max(...pixels.slice(0, 3)) - Math.min(...pixels.slice(0, 3));
  if (mode === 'saturate') assert.ok(spread(full.pixels) > spread(low.pixels));
  else assert.ok(spread(full.pixels) < spread(low.pixels));
  assert.equal(full.pixels[3], 201);
  assert.equal(low.pixels[3], 201);
});

test('Sponge zero amount is an identity and transparent pixels keep hidden RGB', () => {
  const source = rgba(2, 1, [10, 20, 30, 0]);
  source.set([220, 10, 30, 0], 4);
  const result = applySpongeStroke(source, source, { ...base({ width: 2, height: 1, x1: 0, y1: 0, x2: 1, y2: 0, size: 4 }), amount: 0, mode: 'saturate' });
  assert.equal(result.changed, false);
  assert.deepEqual(result.pixels, source);
});

test('replaying one stroke is deterministic and destination/source are never mutated', () => {
  const source = rgba(8, 2, [90, 110, 130, 255]);
  const destination = source.slice();
  const originalSource = source.slice();
  const options = base({ width: 8, height: 2, x1: 0, y1: 0, x2: 7, y2: 1, size: 3, mode: 'burn', flow: 0.7 });
  const first = applyDodgeBurnStroke(source, destination, options);
  const second = applyDodgeBurnStroke(source, destination, options);
  assert.deepEqual(first.pixels, second.pixels);
  assert.deepEqual(first.mask, second.mask);
  assert.deepEqual(source, originalSource);
  assert.deepEqual(destination, source);
  assert.equal(dodgeBurnStroke, applyDodgeBurnStroke);
  assert.equal(spongeStroke, applySpongeStroke);
});

test('malformed dimensions, buffers, points, ranges and amounts are rejected', () => {
  const source = rgba(2, 2);
  assert.throws(() => applyDodgeBurnStroke(source, source, base({ width: 0 })), /dimensions/);
  assert.throws(() => applyDodgeBurnStroke(new Uint8ClampedArray(3), source, base()), /Source/);
  assert.throws(() => applyDodgeBurnStroke(source, source, base({ x1: Number.NaN })), /points/);
  assert.throws(() => applyDodgeBurnStroke(source, source, base({ width: 2, height: 2, range: 'all' })), /range/);
  assert.throws(() => applyDodgeBurnStroke(source, source, base({ width: 2, height: 2, exposure: 2 })), /Exposure/);
  assert.throws(() => applySpongeStroke(source, source, { ...base({ width: 2, height: 2 }), amount: 0.5, flow: 2, mode: 'saturate' }), /Flow/);
  assert.throws(() => applySpongeStroke(source, source, { ...base({ width: 2, height: 2 }), amount: -1, mode: 'saturate' }), /amount/);
  assert.throws(() => applySpongeStroke(source, source, { ...base({ width: 2, height: 2 }), mode: 'invert' }), /mode/);
});
