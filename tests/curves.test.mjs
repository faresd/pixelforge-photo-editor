import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCurvesPixels,
  effectiveCurves,
  identityCurve,
  isNeutralCurves,
  normalizeCurvePoints,
  removeCurvePoint,
  sampleCurve,
  setCurvePoint,
  moveCurvePoint,
  validCurves,
  validCurvePoints,
  curvesPixel,
} from '../src/curves.ts';

test('identity curves are neutral and leave pixels unchanged', () => {
  const data = new Uint8ClampedArray([12, 98, 240, 255, 4, 5, 6, 0]);
  const before = [...data];
  assert.equal(isNeutralCurves(undefined), true);
  assert.deepEqual(applyCurvesPixels(data, undefined), data);
  assert.deepEqual([...data], before);
});

test('curve sampling interpolates and clamps at endpoints', () => {
  const points = [[0, 0], [128, 255], [255, 0]];
  assert.equal(sampleCurve(points, -20), 0);
  assert.equal(sampleCurve(points, 64), 128);
  assert.equal(sampleCurve(points, 128), 255);
  assert.equal(sampleCurve(points, 192), 126);
  assert.equal(sampleCurve(points, 300), 0);
});

test('composite RGB curve remaps all channels deterministically', () => {
  const curves = effectiveCurves({ rgb: [[0, 0], [128, 192], [255, 255]] });
  assert.deepEqual(curvesPixel(64, 128, 200, curves), [96, 192, 228]);
});

test('per-channel curves apply after the composite curve', () => {
  const curves = effectiveCurves({
    red: [[0, 30], [255, 220]],
    green: identityCurve,
    blue: [[0, 255], [255, 0]],
  });
  assert.deepEqual(curvesPixel(0, 90, 255, curves), [30, 90, 0]);
});

test('pixel application preserves alpha and transparent RGB', () => {
  const data = new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 0]);
  applyCurvesPixels(data, { red: [[0, 255], [255, 0]] });
  assert.deepEqual([...data], [245, 20, 30, 255, 1, 2, 3, 0]);
});

test('normalization clamps, sorts, deduplicates and adds endpoint anchors', () => {
  assert.deepEqual(normalizeCurvePoints([[240, 240], [32, 22], [32, 50], [-4, 9]]), [
    [0, 9],
    [32, 50],
    [240, 240],
    [255, 240],
  ]);
});

test('validation rejects unsorted, malformed and missing endpoint curves', () => {
  assert.equal(validCurves(effectiveCurves(undefined)), true);
  assert.equal(validCurves({ rgb: [[0, 0], [20, 30]], red: identityCurve, green: identityCurve, blue: identityCurve }), false);
  assert.equal(validCurves({ rgb: [[0, 0], [255, 255]], red: [[0, 0], [128, 200], [100, 80], [255, 255]], green: identityCurve, blue: identityCurve }), false);
});

test('setCurvePoint edits existing points and inserts bounded controls', () => {
  const points = setCurvePoint(identityCurve, 128, 180);
  assert.deepEqual(points, [[0, 0], [128, 180], [255, 255]]);
  assert.deepEqual(setCurvePoint(points, 128, 120), [[0, 0], [128, 120], [255, 255]]);
  assert.deepEqual(setCurvePoint(points, -10, 99)[0], [0, 99]);
});

test('removeCurvePoint retains mandatory endpoints', () => {
  const points = [[0, 0], [128, 180], [255, 255]];
  assert.deepEqual(removeCurvePoint(points, 128), [[0, 0], [255, 255]]);
  assert.deepEqual(removeCurvePoint(points, 0), points);
  assert.deepEqual(removeCurvePoint(points, 255), points);
});

test('curve output stays bounded for extreme controls', () => {
  const data = new Uint8ClampedArray([0, 64, 128, 255, 255, 255, 255, 255]);
  applyCurvesPixels(data, { rgb: [[0, 255], [128, 0], [255, 255]] });
  for (const channel of [data[0], data[1], data[2], data[4], data[5], data[6]]) {
    assert.ok(channel >= 0 && channel <= 255);
  }
});

test('normalization always retains both endpoint anchors when a curve exceeds 33 controls', () => {
  for (const length of [34, 64, 128, 256]) {
    const source = Array.from({ length }, (_, index) => [
      Math.round((index / (length - 1)) * 255),
      index % 256,
    ]);
    const normalized = normalizeCurvePoints(source);
    assert.ok(normalized.length <= 33);
    assert.equal(normalized[0][0], 0);
    assert.equal(normalized.at(-1)[0], 255);
    assert.equal(validCurvePoints(normalized), true);
  }
});

test('empty and wholly invalid curves normalize to identity instead of black', () => {
  for (const value of [undefined, null, [], {}, [null, {}, [NaN, 8], [12, Infinity]]]) {
    assert.deepEqual(normalizeCurvePoints(value), identityCurve);
  }
});

test('normalization and edits retain their caller-owned arrays unchanged', () => {
  const points = [[255, 210], [128, 180], [0, 10]];
  const before = structuredClone(points);
  normalizeCurvePoints(points);
  setCurvePoint(points, 100, 80);
  removeCurvePoint(points, 128);
  assert.deepEqual(points, before);
});

test('curve validation covers numeric types, boundaries, duplicate inputs and channel completeness', () => {
  for (const curve of [
    [[0, 0], [255, 255.1]],
    [[0, 0], [255, -1]],
    [[0, 0], [255, 256]],
    [[0, 0], [255, NaN]],
    [[0, 0], [255, Infinity]],
    [[0, 0], ['255', 255]],
    [[0, 0], [true, 200], [255, 255]],
    [[0, 0], [128, 10], [128, 20], [255, 255]],
    [[1, 0], [255, 255]],
    [[0, 0], [254, 255]],
    [[0, 0]],
    [],
  ]) assert.equal(validCurvePoints(curve), false);
  assert.equal(validCurves({ rgb: identityCurve, red: identityCurve, green: identityCurve }), false);
  assert.equal(validCurves([]), false);
  assert.equal(validCurvePoints([[0, 255], [255, 0]]), true);
});

test('point insertion at the control limit never produces an invalid curve', () => {
  const points = normalizeCurvePoints(Array.from({ length: 33 }, (_, index) => [
    Math.round((index / 32) * 255),
    Math.round((index / 32) * 255),
  ]));
  const added = setCurvePoint(points, 17, 99);
  assert.equal(validCurvePoints(added), true);
  assert.equal(added[0][0], 0);
  assert.equal(added.at(-1)[0], 255);
  assert.ok(added.length <= 33);
});

test('nonfinite point edits cannot poison a valid curve', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const edited of [
      setCurvePoint(identityCurve, value, 128),
      setCurvePoint(identityCurve, 0, value),
      setCurvePoint(identityCurve, 128, value),
    ]) {
      assert.equal(validCurvePoints(edited), true);
      assert.deepEqual(edited, identityCurve);
    }
  }
});

test('nonfinite sample inputs use zero instead of returning an arbitrary endpoint', () => {
  const points = [[0, 30], [128, 160], [255, 250]];
  for (const value of [NaN, Infinity, -Infinity])
    assert.equal(sampleCurve(points, value), 30);
});

test('moving a control changes one point without leaving drag trails', () => {
  const source = [[0, 0], [64, 100], [128, 180], [255, 255]];
  const before = structuredClone(source);
  const first = moveCurvePoint(source, 128, 160, 200);
  assert.deepEqual(first, [[0, 0], [64, 100], [160, 200], [255, 255]]);
  const second = moveCurvePoint(first, 160, 180, 210);
  assert.deepEqual(second, [[0, 0], [64, 100], [180, 210], [255, 255]]);
  assert.deepEqual(source, before);
});

test('moving anchors pins their input while allowing bounded endpoint output', () => {
  assert.deepEqual(moveCurvePoint(identityCurve, 0, 50, 80), [[0, 80], [255, 255]]);
  assert.deepEqual(moveCurvePoint(identityCurve, 255, 50, 200), [[0, 0], [255, 200]]);
  assert.deepEqual(moveCurvePoint(identityCurve, 0, 200, -10), identityCurve);
  assert.deepEqual(moveCurvePoint(identityCurve, 255, 0, 300), identityCurve);
});

test('moving onto an interior destination replaces it and preserves endpoints', () => {
  const source = [[0, 0], [64, 100], [128, 180], [255, 255]];
  assert.deepEqual(moveCurvePoint(source, 128, 64, 220), [[0, 0], [64, 220], [255, 255]]);
});

test('invalid moves and an absent source leave the normalized curve unchanged', () => {
  const source = [[0, 0], [64, 100], [128, 180], [255, 255]];
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(moveCurvePoint(source, value, 100, 80), source);
    assert.deepEqual(moveCurvePoint(source, 128, value, 80), source);
    assert.deepEqual(moveCurvePoint(source, 128, 100, value), source);
  }
  assert.deepEqual(moveCurvePoint(source, 100, 120, 60), source);
});

test('bulk curves output exhaustively matches an independent piecewise reference', () => {
  const curves = effectiveCurves({
    rgb: [[0, 0], [128, 192], [255, 255]],
    red: [[0, 255], [255, 0]],
    green: [[0, 0], [96, 200], [255, 255]],
    blue: [[0, 5], [255, 180]],
  });
  const composite = (value) => value <= 128
    ? Math.round((value / 128) * 192)
    : Math.round(192 + ((value - 128) / 127) * 63);
  const expectedRed = (value) => 255 - composite(value);
  const expectedGreen = (value) => {
    const corrected = composite(value);
    return corrected <= 96
      ? Math.round((corrected / 96) * 200)
      : Math.round(200 + ((corrected - 96) / 159) * 55);
  };
  const expectedBlue = (value) => Math.round(5 + (composite(value) / 255) * 175);
  const pixels = new Uint8ClampedArray(256 * 4);
  for (let value = 0; value < 256; value += 1)
    pixels.set([value, 255 - value, (value * 37) % 256, 255], value * 4);
  applyCurvesPixels(pixels, curves);
  for (let value = 0; value < 256; value += 1)
    assert.deepEqual([...pixels.slice(value * 4, value * 4 + 4)], [
      expectedRed(value),
      expectedGreen(255 - value),
      expectedBlue((value * 37) % 256),
      255,
    ]);
});

test('all 8-bit samples match in-place correction while alpha is retained', () => {
  const curves = effectiveCurves({
    rgb: [[0, 20], [64, 110], [180, 130], [255, 245]],
    red: [[0, 255], [255, 0]],
    green: [[0, 0], [96, 200], [255, 255]],
    blue: [[0, 5], [255, 180]],
  });
  const pixels = new Uint8ClampedArray(256 * 4);
  for (let value = 0; value < 256; value += 1) {
    pixels[value * 4] = value;
    pixels[value * 4 + 1] = 255 - value;
    pixels[value * 4 + 2] = (value * 37) % 256;
    pixels[value * 4 + 3] = value === 0 ? 0 : value;
  }
  const before = pixels.slice();
  applyCurvesPixels(pixels, curves);
  for (let value = 0; value < 256; value += 1) {
    const offset = value * 4;
    assert.equal(pixels[offset + 3], before[offset + 3]);
    const expected = value === 0
      ? [...before.slice(offset, offset + 3)]
      : curvesPixel(before[offset], before[offset + 1], before[offset + 2], curves);
    assert.deepEqual([...pixels.slice(offset, offset + 3)], expected);
  }
});
