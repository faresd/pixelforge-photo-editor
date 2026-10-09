import assert from 'node:assert/strict';
import test from 'node:test';
import { quickSelectionMask } from '../src/quickSelection.ts';

function rgba(width, rows) {
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((row, y) => row.forEach((pixel, x) => data.set(pixel, (y * width + x) * 4)));
  return data;
}

test('quick selection grows a connected colour component and stops at an edge', () => {
  const source = rgba(5, [
    [[220, 30, 30, 255], [220, 30, 30, 255], [20, 20, 20, 255], [40, 40, 40, 255], [40, 40, 40, 255]],
    [[220, 30, 30, 255], [220, 30, 30, 255], [20, 20, 20, 255], [40, 40, 40, 255], [40, 40, 40, 255]],
  ]);
  const before = source.slice();
  const selected = quickSelectionMask(source, { width: 5, height: 2, size: 2, tolerance: 4, points: [{ x: 0, y: 0 }] });
  assert.deepEqual([...selected], [255, 255, 0, 0, 0, 255, 255, 0, 0, 0]);
  assert.deepEqual(source, before);
});

test('quick selection unions distinct brush samples with opacity and ignores transparent pixels', () => {
  const source = rgba(4, [
    [[10, 10, 10, 255], [10, 10, 10, 0], [200, 200, 200, 255], [200, 200, 200, 255]],
  ]);
  const selected = quickSelectionMask(source, { width: 4, height: 1, size: 1, tolerance: 0, opacity: 0.5, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] });
  assert.deepEqual([...selected], [128, 0, 128, 128]);
});

test('quick selection rejects unsafe bounds', () => {
  const source = new Uint8ClampedArray(4);
  assert.throws(() => quickSelectionMask(source, { width: 1, height: 1, size: 0, tolerance: 4, points: [{ x: 0, y: 0 }] }), /size/);
  assert.throws(() => quickSelectionMask(source, { width: 1, height: 1, size: 2, tolerance: 4, points: [] }), /between 1 and 512/);
  assert.throws(() => quickSelectionMask(source, { width: 1, height: 1, size: 2, tolerance: 300, points: [{ x: 0, y: 0 }] }), /tolerance/);
});
