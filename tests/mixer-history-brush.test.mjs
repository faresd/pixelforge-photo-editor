import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  applyHistoryBrushPixels,
  applyMixerBrushPixels,
  effectiveHistoryBrush,
  effectiveMixerBrush,
  validHistoryBrushSettings,
  validMixerBrushSettings,
} from '../src/mixerHistoryBrush.ts';

const pixels = (w, h, colour) => {
  const result = new Uint8ClampedArray(w * h * 4);
  for (let index = 0; index < w * h; index += 1) result.set(colour, index * 4);
  return result;
};

test('Mixer Brush validates bounded controls and resolves stable defaults', () => {
  assert.equal(validMixerBrushSettings(DEFAULT_MIXER_BRUSH), true);
  assert.equal(validHistoryBrushSettings(DEFAULT_HISTORY_BRUSH), true);
  assert.equal(validMixerBrushSettings({ ...DEFAULT_MIXER_BRUSH, wet: 101 }), false);
  assert.equal(validHistoryBrushSettings({ ...DEFAULT_HISTORY_BRUSH, opacity: -1 }), false);
  assert.deepEqual(effectiveMixerBrush({ mix: 0 }).mix, 0);
  assert.deepEqual(effectiveHistoryBrush({ flow: 42 }).flow, 42);
});

test('Mixer Brush blends an immutable source with deterministic alpha handling', () => {
  const source = pixels(5, 5, [220, 40, 20, 255]);
  const destination = pixels(5, 5, [20, 40, 220, 255]);
  const originalSource = new Uint8ClampedArray(source);
  const output = applyMixerBrushPixels(destination, source, 5, 5, [{ x: 2, y: 2 }], {
    ...DEFAULT_MIXER_BRUSH,
    size: 3,
    hardness: 100,
    flow: 100,
    wet: 100,
    load: 100,
    mix: 100,
  });
  assert.deepEqual(Array.from(source), Array.from(originalSource));
  assert.deepEqual(Array.from(destination), Array.from(pixels(5, 5, [20, 40, 220, 255])));
  assert.deepEqual(Array.from(output.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [220, 40, 20, 255]);
  assert.deepEqual(Array.from(output.slice(0, 4)), [20, 40, 220, 255]);
});

test('History Brush restores a prior raster through a soft alpha mask', () => {
  const source = pixels(5, 5, [10, 220, 20, 255]);
  const destination = pixels(5, 5, [220, 20, 30, 255]);
  const output = applyHistoryBrushPixels(destination, source, 5, 5, [{ x: 2, y: 2 }], {
    ...DEFAULT_HISTORY_BRUSH,
    size: 3,
    hardness: 100,
    opacity: 50,
    flow: 100,
  });
  assert.deepEqual(Array.from(output.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [115, 120, 25, 255]);
  assert.deepEqual(Array.from(output.slice(0, 4)), [220, 20, 30, 255]);
});

test('source transparency does not erase opaque destination and selection alpha gates edits', () => {
  const source = pixels(3, 3, [0, 0, 0, 0]);
  const destination = pixels(3, 3, [80, 90, 100, 255]);
  const selection = new Uint8ClampedArray(9);
  selection[4] = 255;
  const output = applyHistoryBrushPixels(destination, source, 3, 3, [{ x: 1, y: 1 }], {
    ...DEFAULT_HISTORY_BRUSH,
    size: 3,
    hardness: 100,
    opacity: 100,
    flow: 100,
  }, selection);
  assert.deepEqual(Array.from(output), Array.from(destination));
});

test('invalid dimensions, pixels, and points fail closed', () => {
  const data = pixels(2, 2, [0, 0, 0, 255]);
  assert.throws(() => applyMixerBrushPixels(data, data, 0, 2, [], DEFAULT_MIXER_BRUSH), /dimensions/);
  assert.throws(() => applyMixerBrushPixels(data, new Uint8ClampedArray(1), 2, 2, [], DEFAULT_MIXER_BRUSH), /source pixels/);
  assert.throws(() => applyHistoryBrushPixels(data, data, 2, 2, [{ x: Number.NaN, y: 1 }], DEFAULT_HISTORY_BRUSH), /points/);
});
