import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRadialStamp,
  effectiveBrushPressureSettings,
  normalizeBrushPressure,
  radialCoverage,
  radialStampMask,
  resolveBrushStamp,
  validBrushPressureSettings,
} from '../src/brush.ts';

const base = { width: 9, height: 9, x: 4, y: 4, size: 5, hardness: 100, opacity: 1, pointerType: 'mouse', pressure: 1 };
const pixels = (width, height, rgba = [0, 0, 0, 0]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return data;
};
const alphaAt = (data, width, x, y) => data[(y * width + x) * 4 + 3];
const maskAt = (data, width, x, y) => data[y * width + x];

 test('radial coverage has bounded centre, hardness edge, and outside behavior', () => {
  assert.equal(radialCoverage(0, 5, 0), 1);
  assert.equal(radialCoverage(2.5, 5, 0), 0.5);
  assert.equal(radialCoverage(5, 5, 0), 0);
  assert.equal(radialCoverage(5, 5, 100), 1);
  assert.equal(radialCoverage(5.001, 5, 100), 0);
  assert.equal(radialCoverage(2, 5, 50), 1);
  assert.equal(radialCoverage(4, 5, 50), 0.4);
});

test('radial mask is clipped to canvas and does not write outside the circle', () => {
  const mask = radialStampMask({ ...base, x: 0, y: 0, size: 5, hardness: 100 });
  assert.deepEqual(mask.bounds, { left: 0, top: 0, right: 3, bottom: 3 });
  assert.equal(maskAt(mask.data, mask.width, 0 - mask.bounds.left, 0 - mask.bounds.top), 255);
  assert.equal(maskAt(mask.data, mask.width, 2 - mask.bounds.left, 2 - mask.bounds.top), 0);
  assert.equal(mask.width, 3); assert.equal(mask.height, 3);
  assert.equal(mask.data.length, 9);
});

test('hardness creates a deterministic soft edge while hard stamps stay opaque to the boundary', () => {
  const soft = radialStampMask({ ...base, size: 6, hardness: 0 });
  const hard = radialStampMask({ ...base, size: 6, hardness: 100 });
  assert.ok(maskAt(soft.data, soft.width, 4 - soft.bounds.left, 4 - soft.bounds.top) > maskAt(soft.data, soft.width, 6 - soft.bounds.left, 4 - soft.bounds.top));
  assert.equal(maskAt(soft.data, soft.width, 7 - soft.bounds.left, 4 - soft.bounds.top), 0);
  assert.equal(maskAt(hard.data, hard.width, 7 - hard.bounds.left, 4 - hard.bounds.top), 255);
  assert.equal(maskAt(hard.data, hard.width, 8 - hard.bounds.left, 4 - hard.bounds.top), 0);
});

test('pressure fallback is full for mouse and missing/zero touch pressure', () => {
  assert.equal(normalizeBrushPressure('mouse', 0.2), 1);
  assert.equal(normalizeBrushPressure('touch', 0), 1);
  assert.equal(normalizeBrushPressure('pen', undefined), 1);
  assert.equal(normalizeBrushPressure('pen', 0.35), 0.35);
  assert.equal(normalizeBrushPressure('touch', 1.5), 1);
});

test('pressure size and opacity flags can be enabled independently', () => {
  const both = resolveBrushStamp({ ...base, pointerType: 'pen', pressure: 0.5, size: 10, opacity: 0.8, pressureSize: true, pressureOpacity: true });
  assert.equal(both.size, 5); assert.equal(both.radius, 2.5); assert.equal(both.opacity, 0.4);
  const noSize = resolveBrushStamp({ ...base, pointerType: 'pen', pressure: 0.5, size: 10, opacity: 0.8, pressureSize: false, pressureOpacity: true });
  assert.equal(noSize.size, 10); assert.equal(noSize.opacity, 0.4);
  const noOpacity = resolveBrushStamp({ ...base, pointerType: 'pen', pressure: 0.5, size: 10, opacity: 0.8, pressureSize: true, pressureOpacity: false });
  assert.equal(noOpacity.size, 5); assert.equal(noOpacity.opacity, 0.8);
  const disabled = resolveBrushStamp({ ...base, pointerType: 'pen', pressure: 0.5, size: 10, opacity: 0.8, pressureSize: false, pressureOpacity: false });
  assert.equal(disabled.size, 10); assert.equal(disabled.opacity, 0.8);
  assert.deepEqual(effectiveBrushPressureSettings(undefined), { pressureSize: false, pressureOpacity: false });
  assert.equal(validBrushPressureSettings({ pressureSize: false, pressureOpacity: true }), true);
  assert.equal(validBrushPressureSettings({ pressureSize: 'yes' }), false);
});

test('source-over applies color and opacity monotonically without mutating a separate source', () => {
  const destination = pixels(9, 9, [10, 20, 30, 255]);
  const result = applyRadialStamp(destination, { ...base, size: 5, opacity: 0.5, mode: 'source-over', color: [210, 120, 30, 255] });
  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(destination.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 4)), [110, 70, 30, 255]);
  assert.equal(result.mask[(4 - result.bounds.top) * result.width + (4 - result.bounds.left)], 128);
  assert.ok(destination[(4 * 9 + 3) * 4] !== undefined);
});

test('destination-out eraser reduces alpha monotonically and clears fully transparent RGB', () => {
  const destination = pixels(9, 9, [50, 60, 70, 255]);
  const first = applyRadialStamp(destination, { ...base, size: 5, opacity: 0.25, mode: 'destination-out' });
  const centerAfterFirst = alphaAt(destination, 9, 4, 4);
  applyRadialStamp(destination, { ...base, size: 5, opacity: 0.5, mode: 'destination-out' });
  assert.equal(first.changed, true);
  assert.ok(alphaAt(destination, 9, 4, 4) < centerAfterFirst);
  const clear = pixels(3, 3, [50, 60, 70, 255]);
  applyRadialStamp(clear, { width: 3, height: 3, x: 1, y: 1, size: 3, hardness: 100, opacity: 1, mode: 'destination-out' });
  assert.deepEqual(Array.from(clear.slice(16, 20)), [0, 0, 0, 0]);
});

test('clone uses an immutable source and returns a reusable mask', () => {
  const destination = pixels(5, 5, [0, 0, 0, 255]);
  const source = pixels(5, 5, [0, 0, 0, 255]);
  source.set([200, 10, 30, 255], (1 * 5 + 1) * 4);
  const originalSource = source.slice();
  const result = applyRadialStamp(destination, { width: 5, height: 5, x: 3, y: 3, sourceX: 1, sourceY: 1, size: 3, hardness: 100, opacity: 1, mode: 'clone', source });
  assert.deepEqual(Array.from(source), Array.from(originalSource));
  assert.deepEqual(Array.from(destination.slice((3 * 5 + 3) * 4, (3 * 5 + 3) * 4 + 4)), [200, 10, 30, 255]);
  assert.equal(result.mask[(3 - result.bounds.top) * result.width + (3 - result.bounds.left)], 255);
});

test('clone validates the shifted source rectangle rather than destination coordinates', () => {
  const destination = pixels(7, 7, [0, 0, 0, 255]);
  const source = Array.from(pixels(7, 7, [0, 0, 0, 255]), (value) => value);
  // The destination stamp is centred at (5, 5), while clone samples around
  // (1, 1). An invalid channel at the sampled source centre must be rejected.
  source[(1 * 7 + 1) * 4] = NaN;
  assert.throws(() => applyRadialStamp(destination, {
    width: 7,
    height: 7,
    x: 5,
    y: 5,
    sourceX: 1,
    sourceY: 1,
    size: 3,
    hardness: 100,
    opacity: 1,
    mode: 'clone',
    source,
  }), /Source/);
});

test('healing reuses the same mask with the bounded default healing opacity', () => {
  const destination = pixels(3, 3, [0, 0, 255, 255]);
  const source = pixels(3, 3, [255, 0, 0, 255]);
  const result = applyRadialStamp(destination, { width: 3, height: 3, x: 1, y: 1, size: 3, hardness: 100, opacity: 1, mode: 'heal', source });
  assert.equal(result.mask[(1 - result.bounds.top) * result.width + (1 - result.bounds.left)], 255);
  assert.deepEqual(Array.from(destination.slice(16, 20)), [166, 0, 89, 255]);
});

test('invalid sizes, hardness, pressure flags, dimensions, modes, sources and colors are rejected', () => {
  assert.throws(() => resolveBrushStamp({ ...base, size: 0 }), /size/);
  assert.throws(() => resolveBrushStamp({ ...base, hardness: 101 }), /hardness/);
  assert.throws(() => resolveBrushStamp({ ...base, hardness: -1 }), /hardness/);
  assert.throws(() => resolveBrushStamp({ ...base, opacity: 2 }), /opacity/);
  assert.throws(() => resolveBrushStamp({ ...base, pressureSize: 'yes' }), /pressure/);
  assert.throws(() => radialStampMask({ ...base, width: 0 }), /dimensions/);
  assert.throws(() => applyRadialStamp(pixels(2, 2), { ...base, width: 2, height: 2, mode: 'nope' }), /mode/);
  assert.throws(() => applyRadialStamp(pixels(2, 2), { ...base, width: 2, height: 2, mode: 'clone' }), /source/);
  assert.throws(() => applyRadialStamp(pixels(2, 2), { ...base, width: 2, height: 2, mode: 'source-over', color: [0, 0, 0] }), /color/);
  assert.throws(() => applyRadialStamp(pixels(2, 2), { ...base, width: 2, height: 2, mode: 'clone', source: new Uint8ClampedArray(4) }), /Source/);
  const invalid = Array.from({ length: 3 * 3 * 4 }, () => 0); invalid[(1 * 3 + 1) * 4] = NaN;
  assert.throws(() => applyRadialStamp(invalid, { width: 3, height: 3, x: 1, y: 1, size: 3, hardness: 100, opacity: 1, mode: 'destination-out' }), /Destination/);
});
