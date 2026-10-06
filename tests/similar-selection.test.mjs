import test from 'node:test';
import assert from 'node:assert/strict';
import { similarColorMask } from '../src/similarSelection.ts';

const rgba = (pixels) => Uint8ClampedArray.from(pixels.flat());

test('Similar Selection derives a weighted seed colour and selects matching pixels', () => {
  const source = rgba([
    [250, 10, 10, 255], [245, 15, 15, 255], [10, 10, 240, 255],
    [250, 10, 10, 128],
  ]);
  const seed = Uint8ClampedArray.from([255, 255, 0, 0]);
  const before = source.slice();
  const result = similarColorMask(source, seed, { width: 2, height: 2, fuzziness: 32 });
  assert.deepEqual(result.target, [248, 13, 13]);
  assert.deepEqual([...result.mask], [231, 231, 0, 116]);
  assert.deepEqual(source, before);
});

test('Similar Selection supports exact matching, transparent seeds and bounds', () => {
  const source = rgba([
    [100, 100, 100, 255], [100, 100, 100, 0],
  ]);
  assert.deepEqual(
    [...similarColorMask(source, Uint8ClampedArray.from([255, 255]), { width: 2, height: 1, fuzziness: 0 }).mask],
    [255, 0],
  );
  assert.throws(
    () => similarColorMask(source, Uint8ClampedArray.from([0, 0]), { width: 2, height: 1 }),
    /visible selected pixel/,
  );
  assert.throws(
    () => similarColorMask(source, Uint8ClampedArray.from([255]), { width: 2, height: 1 }),
    /wrong size/,
  );
});
