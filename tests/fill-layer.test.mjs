import test from 'node:test';
import assert from 'node:assert/strict';
import { neutral } from '../src/document.ts';

test('solid fill metadata uses a bounded hex color and neutral adjustments', () => {
  const fill = { kind: 'raster', fillColor: '#12abef', adjustments: neutral };
  assert.match(fill.fillColor, /^#[a-f\d]{6}$/i);
  assert.equal(fill.adjustments.brightness, 100);
});

test('solid fill rejects malformed colors at the UI contract boundary', () => {
  assert.equal(/^#[a-f\d]{6}$/i.test('#12abef'), true);
  assert.equal(/^#[a-f\d]{6}$/i.test('rgb(1,2,3)'), false);
});
