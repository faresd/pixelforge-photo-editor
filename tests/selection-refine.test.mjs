import test from 'node:test';
import assert from 'node:assert/strict';
import {
  refineSelectionAlpha,
  selectionRefineBounds,
} from '../src/selectionRefine.ts';

test('grow uses a centred square neighbourhood and does not mutate source alpha', () => {
  const source = new Uint8ClampedArray(25);
  source[2 * 5 + 2] = 255;
  const grown = refineSelectionAlpha(source, 5, 5, 'grow', 1);
  assert.equal(source.filter(Boolean).length, 1);
  assert.equal(grown.filter(Boolean).length, 9);
  assert.equal(grown[0], 0);
  assert.equal(grown[1 * 5 + 1], 255);
  assert.equal(grown[3 * 5 + 3], 255);
  assert.equal(grown[4 * 5 + 4], 0);
});

test('contract reverses a solid grown region and keeps fractional coverage deterministic', () => {
  const source = new Uint8ClampedArray(7 * 7);
  for (let y = 1; y < 6; y += 1) {
    for (let x = 1; x < 6; x += 1) source[y * 7 + x] = 255;
  }
  source[3 * 7 + 3] = 128;
  const contracted = refineSelectionAlpha(source, 7, 7, 'contract', 1);
  assert.equal(contracted.filter(Boolean).length, 9);
  assert.equal(contracted[3 * 7 + 3], 128);
  assert.equal(contracted[2 * 7 + 2], 128);
  const fractional = new Uint8ClampedArray([0, 90, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(
    [...refineSelectionAlpha(fractional, 3, 3, 'grow', 1)],
    [90, 90, 90, 90, 90, 90, 0, 0, 0],
  );
});

test('radius zero clones alpha and bounds reject malformed masks', () => {
  const source = new Uint8ClampedArray([10, 20, 30, 40]);
  const copy = refineSelectionAlpha(source, 2, 2, 'grow', 0);
  assert.deepEqual([...copy], [...source]);
  assert.notEqual(copy, source);
  assert.throws(() => refineSelectionAlpha(source, 0, 2, 'grow', 1), /dimensions/);
  assert.throws(() => refineSelectionAlpha(source, 2, 2, 'grow', 1.5), /whole number/);
  assert.throws(() => refineSelectionAlpha(source, 2, 2, 'grow', selectionRefineBounds.maxRadius + 1), /whole number/);
  assert.throws(() => refineSelectionAlpha(new Uint8ClampedArray(3), 2, 2, 'grow', 1), /wrong size/);
});
