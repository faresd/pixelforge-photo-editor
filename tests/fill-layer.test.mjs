import test from 'node:test';
import assert from 'node:assert/strict';
import { commonLayer, neutral, validateFrame } from '../src/document.ts';

test('solid fill metadata uses a bounded hex color and neutral adjustments', () => {
  const fill = { kind: 'raster', fillColor: '#12abef', adjustments: neutral };
  assert.match(fill.fillColor, /^#[a-f\d]{6}$/i);
  assert.equal(fill.adjustments.brightness, 100);
});

test('solid fill rejects malformed colors at the UI contract boundary', () => {
  assert.equal(/^#[a-f\d]{6}$/i.test('#12abef'), true);
  assert.equal(/^#[a-f\d]{6}$/i.test('rgb(1,2,3)'), false);
});


test('solid fill metadata is accepted in a valid frame and malformed colors fail closed', () => {
  const asset = '11111111-1111-4111-8111-111111111111';
  const baseLayer = { ...commonLayer('Fill'), kind: 'raster', asset, fillColor: '#12abef' };
  const assets = { [asset]: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=', w: 1, h: 1 } };
  const frame = { w: 1, h: 1, layers: [baseLayer], active: baseLayer.id };
  assert.doesNotThrow(() => validateFrame(frame, assets));
  assert.throws(() => validateFrame({ ...frame, layers: [{ ...baseLayer, fillColor: '#12abef0' }] }, assets), /Invalid layer document/);
  assert.throws(() => validateFrame({ ...frame, layers: [{ ...baseLayer, fillColor: 'rgb(1,2,3)' }] }, assets), /Invalid layer document/);
});
