import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaBounds,
  alphaFromRgba,
  normalizeTextMaskRequest,
  packAlphaMask,
  TEXT_MASK_MAX_PIXELS,
  TEXT_MASK_MAX_TEXT,
} from '../src/textMask.ts';

test('normalizes bounded horizontal and vertical requests without aliasing input', () => {
  const input = { width: 80, height: 40, text: 'Mask text', orientation: 'horizontal' };
  const normalized = normalizeTextMaskRequest(input);
  assert.deepEqual(normalized, input);
  assert.notStrictEqual(normalized, input);
  input.text = 'changed';
  assert.equal(normalized.text, 'Mask text');
  assert.equal(normalizeTextMaskRequest({ ...normalized, orientation: 'vertical' }).orientation, 'vertical');
});

test('rejects empty, oversized and malformed requests before allocation', () => {
  assert.throws(() => normalizeTextMaskRequest({ width: 80, height: 40, text: '   ', orientation: 'horizontal' }), /empty/);
  assert.throws(() => normalizeTextMaskRequest({ width: 80, height: 40, text: 'x'.repeat(TEXT_MASK_MAX_TEXT + 1), orientation: 'horizontal' }), /empty or too large/);
  assert.throws(() => normalizeTextMaskRequest({ width: 0, height: 40, text: 'x', orientation: 'horizontal' }), /dimensions/);
  assert.throws(() => normalizeTextMaskRequest({ width: 16000, height: 16000, text: 'x', orientation: 'horizontal' }), /dimensions/);
  assert.equal(TEXT_MASK_MAX_PIXELS, 16000000);
  assert.throws(() => normalizeTextMaskRequest({ width: 80, height: 40, text: 'x', orientation: 'diagonal' }), /orientation/);
});

test('extracts and repacks alpha deterministically without mutating pixels', () => {
  const rgba = new Uint8ClampedArray([
    3, 4, 5, 0,
    10, 20, 30, 127,
    40, 50, 60, 255,
    90, 80, 70, 5,
  ]);
  const original = rgba.slice();
  const alpha = alphaFromRgba(rgba, 2, 2);
  assert.deepEqual(Array.from(alpha), [0, 127, 255, 5]);
  assert.deepEqual(rgba, original);
  const packed = packAlphaMask(alpha, 2, 2);
  assert.deepEqual(Array.from(packed), [
    255, 255, 255, 0,
    255, 255, 255, 127,
    255, 255, 255, 255,
    255, 255, 255, 5,
  ]);
  assert.deepEqual(alphaBounds(alpha, 2, 2), { x: 0, y: 0, width: 2, height: 2 });
  assert.deepEqual(alphaBounds(new Uint8ClampedArray([0, 0, 0, 0]), 2, 2), null);
});

test('alpha contracts reject dimensions and buffers that could alias or overrun', () => {
  assert.throws(() => alphaFromRgba(new Uint8ClampedArray(3), 1, 1), /RGBA/);
  assert.throws(() => packAlphaMask(new Uint8ClampedArray(3), 1, 1), /alpha/);
  assert.throws(() => alphaBounds(new Uint8ClampedArray(3), 1, 1), /alpha/);
});
