import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commonLayer,
  neutral,
  referencedAssets,
  validateFrame,
} from '../src/document.ts';
import { layerBounds } from '../src/canvasSize.ts';

const id = () => crypto.randomUUID();
const maskId = '00000000-0000-4000-8000-000000000010';
const maskAsset = {
  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAQAAACe1JrP8AAAADElEQVR42mNkYPgPAAEDAQAIwJcY0QAAAABJRU5ErkJggg==',
  w: 8,
  h: 8,
};

test('adjustment layers are source-free, valid document nodes', () => {
  const layer = {
    ...commonLayer('Levels correction'),
    kind: 'adjustment',
    adjustments: {
      ...neutral,
      levelsBlack: 32,
      levelsWhite: 224,
      levelsGamma: 1.15,
    },
  };
  const frame = {
    w: 8,
    h: 8,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  assert.doesNotThrow(() => validateFrame(frame, {}));
  assert.equal('asset' in layer, false);
  assert.deepEqual(layerBounds(layer, {}), { x: 0, y: 0, width: 0, height: 0 });
});

test('adjustment layer metadata survives a JSON round trip and keeps source neutral', () => {
  const layer = {
    ...commonLayer('Curves correction'),
    kind: 'adjustment',
    adjustments: { ...neutral, hue: 42, saturation: 136 },
  };
  const frame = {
    w: 4,
    h: 4,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  const restored = JSON.parse(JSON.stringify(frame));
  validateFrame(restored, {});
  assert.equal(restored.layers[0].kind, 'adjustment');
  assert.equal(restored.layers[0].adjustments.hue, 42);
  assert.equal(restored.layers[0].adjustments.saturation, 136);
  assert.equal(Object.hasOwn(restored.layers[0], 'asset'), false);
});

test('invalid adjustment node carrying a source asset fails closed', () => {
  const layer = {
    ...commonLayer('Invalid adjustment'),
    kind: 'adjustment',
    asset: id(),
  };
  const frame = {
    w: 4,
    h: 4,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  assert.throws(() => validateFrame(frame, {}), /Invalid layer document/);
});

test('adjustment masks validate, survive JSON round trips and stay referenced', () => {
  const layer = {
    ...commonLayer('Masked correction'),
    kind: 'adjustment',
    mask: maskId,
    maskEnabled: true,
    maskInverted: false,
  };
  const frame = {
    w: 8,
    h: 8,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  const assets = { [maskId]: maskAsset };
  assert.doesNotThrow(() => validateFrame(frame, assets));
  const restored = JSON.parse(JSON.stringify(frame));
  validateFrame(restored, assets);
  assert.equal(restored.layers[0].kind, 'adjustment');
  assert.equal(restored.layers[0].mask, maskId);
  assert.deepEqual(referencedAssets([restored], assets), assets);
});

test('adjustment masks reject malformed flags, dimensions and raster cleanup metadata', () => {
  const base = {
    ...commonLayer('Masked correction'),
    kind: 'adjustment',
    mask: maskId,
  };
  const frame = (layer) => ({
    w: 8,
    h: 8,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  });
  const assets = { [maskId]: maskAsset };
  assert.throws(
    () => validateFrame(frame({ ...base, maskEnabled: 'yes' }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...base, mask: id() }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...base, spotHealing: [] }), assets),
    /Invalid layer document/,
  );
});
