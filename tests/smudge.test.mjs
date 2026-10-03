import assert from 'node:assert/strict';
import test from 'node:test';
import { applySmudgeStroke, smudgeStroke } from '../src/smudge.ts';

const rgba = (...pixels) => Uint8ClampedArray.from(pixels.flatMap((pixel) => pixel));
const opaque = (r, g, b) => [r, g, b, 255];
const base = (patch = {}) => ({
  width: 5,
  height: 1,
  x1: 1,
  y1: 0,
  x2: 3,
  y2: 0,
  size: 4,
  hardness: 100,
  flow: 1,
  ...patch,
});

test('Smudge pulls source colour behind the drag and leaves input buffers untouched', () => {
  const source = rgba(opaque(20, 30, 40), opaque(20, 30, 40), opaque(220, 40, 40), opaque(20, 30, 40), opaque(20, 30, 40));
  const destination = rgba(opaque(20, 30, 40), opaque(20, 30, 40), opaque(20, 30, 40), opaque(20, 30, 40), opaque(20, 30, 40));
  const sourceBefore = source.slice();
  const destinationBefore = destination.slice();
  const result = applySmudgeStroke(source, destination, base());
  assert.ok(result.changed);
  assert.ok(result.pixels[3 * 4] > destination[3 * 4]);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(destination, destinationBefore);
  assert.notEqual(result.pixels, destination);
});

test('flow scales the smear strength monotonically', () => {
  const source = rgba(opaque(20, 30, 40), opaque(20, 30, 40), opaque(240, 80, 20), opaque(20, 30, 40), opaque(20, 30, 40));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const low = applySmudgeStroke(source, destination, base({ flow: 0.25 }));
  const high = applySmudgeStroke(source, destination, base({ flow: 1 }));
  const lowDelta = low.pixels[3 * 4] - destination[3 * 4];
  const highDelta = high.pixels[3 * 4] - destination[3 * 4];
  assert.ok(lowDelta > 0);
  assert.ok(highDelta > lowDelta);
});

test('hardness controls radial coverage and reports a reusable mask', () => {
  const source = rgba(...Array.from({ length: 5 }, () => opaque(220, 20, 20)));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const soft = applySmudgeStroke(source, destination, base({ hardness: 0 }));
  const hard = applySmudgeStroke(source, destination, base({ hardness: 100 }));
  assert.ok(hard.mask[0] >= soft.mask[0]);
  assert.equal(hard.mask.length, 5);
  assert.ok(hard.pixels[2 * 4] >= soft.pixels[2 * 4]);
});

test('selection alpha clips the stroke and remains immutable', () => {
  const source = rgba(...Array.from({ length: 5 }, () => opaque(240, 20, 20)));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const selection = Uint8ClampedArray.from([0, 0, 255, 128, 0]);
  const before = selection.slice();
  const result = applySmudgeStroke(source, destination, base({ selectionMask: selection }));
  assert.deepEqual(selection, before);
  assert.deepEqual(Array.from(result.pixels.slice(0, 8)), Array.from(destination.slice(0, 8)));
  assert.ok(result.pixels[2 * 4] > destination[2 * 4]);
  // The feathered half-selection may change one pixel; the final unselected
  // pixel must remain byte-identical.
  assert.deepEqual(Array.from(result.pixels.slice(4 * 4)), Array.from(destination.slice(4 * 4)));
});

test('alpha remains byte-identical and transparent hidden RGB is never pulled', () => {
  const source = rgba(opaque(250, 20, 20), [1, 2, 3, 0], opaque(250, 20, 20), opaque(250, 20, 20), opaque(250, 20, 20));
  const destination = rgba([10, 20, 30, 0], opaque(20, 30, 40), opaque(20, 30, 40), opaque(20, 30, 40), [90, 80, 70, 0]);
  const result = applySmudgeStroke(source, destination, base({ x1: 0, x2: 4, size: 3 }));
  for (let i = 0; i < 5; i += 1) assert.equal(result.pixels[i * 4 + 3], destination[i * 4 + 3]);
  assert.deepEqual(Array.from(result.pixels.slice(0, 4)), Array.from(destination.slice(0, 4)));
  assert.deepEqual(Array.from(result.pixels.slice(16, 20)), Array.from(destination.slice(16, 20)));
});

test('a click with no direction is a deterministic identity with no history change', () => {
  const source = rgba(...Array.from({ length: 5 }, () => opaque(220, 20, 20)));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const result = applySmudgeStroke(source, destination, base({ x2: 1, y2: 0 }));
  assert.equal(result.changed, false);
  assert.deepEqual(result.pixels, destination);
});

test('zero flow and an empty selection are exact immutable identities', () => {
  const source = rgba(opaque(240, 80, 20), opaque(20, 30, 40), opaque(240, 80, 20), opaque(20, 30, 40), opaque(240, 80, 20));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const flowZero = applySmudgeStroke(source, destination, base({ flow: 0 }));
  const selectionEmpty = applySmudgeStroke(source, destination, base({
    selectionMask: new Uint8ClampedArray(5),
  }));
  assert.equal(flowZero.changed, false);
  assert.equal(selectionEmpty.changed, false);
  assert.deepEqual(flowZero.pixels, destination);
  assert.deepEqual(selectionEmpty.pixels, destination);
  assert.notEqual(flowZero.pixels, destination);
  assert.notEqual(selectionEmpty.pixels, destination);
});

test('out-of-bounds paths are clipped without throwing or changing outside pixels', () => {
  const source = rgba(...Array.from({ length: 5 }, () => opaque(240, 20, 20)));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const result = applySmudgeStroke(source, destination, base({ x1: -20, x2: -10 }));
  assert.equal(result.changed, false);
  assert.deepEqual(result.pixels, destination);
  assert.equal(result.mask.reduce((sum, value) => sum + value, 0), 0);
});

test('transparent source samples leave destination pixels unchanged', () => {
  const source = rgba([1, 2, 3, 0], [1, 2, 3, 0], [1, 2, 3, 0], [1, 2, 3, 0], [1, 2, 3, 0]);
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const result = applySmudgeStroke(source, destination, base());
  assert.equal(result.changed, false);
  assert.deepEqual(result.pixels, destination);
});

test('replaying the same stroke is byte deterministic and the alias is stable', () => {
  const source = rgba(opaque(20, 30, 40), opaque(20, 30, 40), opaque(240, 80, 20), opaque(20, 30, 40), opaque(20, 30, 40));
  const destination = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const first = applySmudgeStroke(source, destination, base({ flow: 0.63 }));
  const second = applySmudgeStroke(source, destination, base({ flow: 0.63 }));
  assert.deepEqual(first.pixels, second.pixels);
  assert.deepEqual(first.mask, second.mask);
  assert.equal(smudgeStroke, applySmudgeStroke);
});

test('invalid dimensions, pixels, flow, masks and geometry fail before output', () => {
  const source = rgba(...Array.from({ length: 5 }, () => opaque(20, 30, 40)));
  const destination = source.slice();
  assert.throws(() => applySmudgeStroke(source, destination, base({ width: 0 })), /dimensions/);
  assert.throws(() => applySmudgeStroke(new Uint8ClampedArray(3), destination, base()), /Source/);
  assert.throws(() => applySmudgeStroke(source, destination, base({ x1: Number.NaN })), /points/);
  assert.throws(() => applySmudgeStroke(source, destination, base({ flow: 2 })), /Flow/);
  assert.throws(() => applySmudgeStroke(source, destination, base({ selectionMask: new Uint8ClampedArray(2) })), /Selection mask/);
  assert.throws(() => applySmudgeStroke(source, destination, base({ hardness: 101 })), /hardness/);
});
