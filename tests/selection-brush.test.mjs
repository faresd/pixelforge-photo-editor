import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineSelectionBrushMasks,
  paintSelectionBrushSegment,
  selectionBrushBounds,
} from '../src/selectionBrush.ts';

const base = {
  width: 9,
  height: 5,
  size: 3,
  hardness: 100,
  opacity: 1,
};

test('Selection Brush paints a clipped hard circular segment without mutating input', () => {
  const before = new Uint8ClampedArray(base.width * base.height);
  const result = paintSelectionBrushSegment(before, { ...base, x1: 0, y1: 2, x2: 8, y2: 2 });
  assert.notEqual(result.mask, before);
  assert.equal(result.changed, true);
  assert.equal(result.mask[2 * base.width], 255);
  assert.equal(result.mask[2 * base.width + 8], 255);
  assert.equal(before.some(Boolean), false);
  assert.equal(result.mask.length, base.width * base.height);
});

test('softness and opacity preserve partial alpha at the brush edge', () => {
  const result = paintSelectionBrushSegment(new Uint8ClampedArray(49), {
    width: 7,
    height: 7,
    size: 6,
    hardness: 0,
    opacity: 0.5,
    x1: 3,
    y1: 3,
    x2: 3,
    y2: 3,
  });
  assert.ok(result.mask[3 * 7 + 3] > 0);
  assert.ok(result.mask[3 * 7 + 1] > 0);
  assert.ok(result.mask[0] === 0);
  assert.ok(result.mask.some((value) => value > 0 && value < 255));
});

test('pressure can reduce size and opacity while zero pressure remains a no-op', () => {
  const small = paintSelectionBrushSegment(new Uint8ClampedArray(81), {
    width: 9,
    height: 9,
    size: 8,
    hardness: 100,
    opacity: 1,
    pressure: 0.5,
    pressureSize: true,
    pressureOpacity: true,
    x1: 4,
    y1: 4,
    x2: 4,
    y2: 4,
  });
  // Pressure affects opacity here: full configured opacity × 0.5 pressure.
  assert.equal(small.mask[4 * 9 + 4], 128);
  const untouched = paintSelectionBrushSegment(new Uint8ClampedArray(81), {
    width: 9,
    height: 9,
    size: 8,
    hardness: 100,
    opacity: 1,
    pressure: 0,
    pressureOpacity: true,
    x1: 4,
    y1: 4,
    x2: 4,
    y2: 4,
  });
  assert.equal(untouched.changed, false);
  assert.equal(untouched.mask.some(Boolean), false);
});

test('replace, add, subtract and intersect compose independent stroke masks', () => {
  const left = Uint8ClampedArray.from([0, 90, 255, 128]);
  const right = Uint8ClampedArray.from([200, 120, 40, 255]);
  assert.deepEqual([...combineSelectionBrushMasks(left, right, 'replace').mask], [200, 120, 40, 255]);
  assert.deepEqual([...combineSelectionBrushMasks(left, right, 'add').mask], [200, 120, 255, 255]);
  assert.deepEqual([...combineSelectionBrushMasks(left, right, 'subtract').mask], [0, 48, 215, 0]);
  assert.deepEqual([...combineSelectionBrushMasks(left, right, 'intersect').mask], [0, 90, 40, 128]);
});

test('composition reports no-op and rejects malformed masks and operations', () => {
  const full = new Uint8ClampedArray([255, 255]);
  assert.equal(combineSelectionBrushMasks(full, full, 'add').changed, false);
  assert.throws(() => combineSelectionBrushMasks(full, [0], 'add'), /different sizes/);
  assert.throws(() => combineSelectionBrushMasks(full, full, 'bad'), /operation is invalid/);
  assert.throws(() => paintSelectionBrushSegment(new Uint8ClampedArray(2), { ...base, x1: 0, y1: 0, x2: 1, y2: 1 }), /wrong size/);
  assert.throws(() => paintSelectionBrushSegment(new Uint8ClampedArray(81), {
    width: 9,
    height: 9,
    size: selectionBrushBounds.maxSize + 1,
    hardness: 100,
    opacity: 1,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
  }), /between 1 and 10,000/);
});
