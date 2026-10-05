import test from 'node:test';
import assert from 'node:assert/strict';
import { composeSelectionAlpha } from '../src/selectionComposition.ts';

test('selection masks compose add, subtract, intersect and replace deterministically', () => {
  const current = [200, 120, 40, 0];
  const incoming = [100, 200, 80, 255];
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'add').mask], [200, 200, 80, 255]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'subtract').mask], [122, 26, 27, 0]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'intersect').mask], [100, 120, 40, 0]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'replace').mask], incoming);
});

test('first selection gesture uses incoming alpha for every operation', () => {
  const incoming = [0, 96, 255];
  for (const operation of ['replace', 'add', 'subtract', 'intersect'])
    assert.deepEqual([...composeSelectionAlpha(undefined, incoming, operation).mask], incoming);
});

test('selection composition is detached and reports whether pixels changed', () => {
  const current = Uint8ClampedArray.from([10, 20]);
  const incoming = Uint8ClampedArray.from([0, 0]);
  const result = composeSelectionAlpha(current, incoming, 'subtract');
  assert.deepEqual([...result.mask], [10, 20]);
  assert.equal(result.changed, false);
  incoming[0] = 255;
  assert.deepEqual([...result.mask], [10, 20]);
});

test('selection composition validates operation, dimensions and alpha values', () => {
  assert.throws(() => composeSelectionAlpha([1], [1, 2], 'add'), /different sizes/);
  assert.throws(() => composeSelectionAlpha([1], [1], 'bad'), /operation is invalid/);
  assert.throws(() => composeSelectionAlpha([1], [Number.NaN], 'add'), /invalid alpha/);
  assert.throws(() => composeSelectionAlpha([Infinity], [1], 'add'), /invalid alpha/);
  assert.throws(() => composeSelectionAlpha({ length: 16_000_001 }, [1], 'add'), /pixel limit/);
});
