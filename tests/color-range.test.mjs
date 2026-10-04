import test from 'node:test';
import assert from 'node:assert/strict';
import { colorRangeDistance, colorRangeMask, colorRangeBounds } from '../src/colorRange.ts';

const rgba = (pixels) => Uint8ClampedArray.from(pixels.flat());

test('Color Range selects exact RGB matches without mutating source', () => {
  const source = rgba([
    [255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 0, 128],
    [255, 0, 0, 0],
  ]);
  const before = source.slice();
  const mask = colorRangeMask(source, { width: 2, height: 2, target: [255, 0, 0], fuzziness: 0 });
  assert.deepEqual([...mask], [255, 0, 128, 0]);
  assert.deepEqual(source, before);
});

test('fuzziness produces deterministic soft edges and ignores hidden transparent RGB', () => {
  const source = rgba([
    [100, 100, 100, 255], [110, 100, 100, 255], [120, 100, 100, 255],
    [100, 100, 100, 0],
  ]);
  const mask = colorRangeMask(source, { width: 2, height: 2, target: [100, 100, 100], fuzziness: 20 });
  assert.deepEqual([...mask], [255, 128, 0, 0]);
});

test('distance and input bounds are validated before allocation', () => {
  assert.equal(colorRangeDistance([10, 20, 30], [15, 5, 45]), 15);
  assert.throws(() => colorRangeDistance([10, 20], [15, 5, 45]), /three 8-bit/);
  assert.throws(() => colorRangeMask(new Uint8ClampedArray(4), { width: 2, height: 2, target: [0, 0, 0] }), /every pixel/);
  assert.throws(() => colorRangeMask(new Uint8ClampedArray(16), { width: 2, height: 2, target: [0, 0, 0], fuzziness: -1 }), /between 0 and 255/);
  assert.throws(() => colorRangeMask(new Uint8ClampedArray(16), { width: colorRangeBounds.maxDimension + 1, height: 1, target: [0, 0, 0] }), /dimensions/);
});
