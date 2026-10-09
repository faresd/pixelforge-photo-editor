import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commonLayer,
  neutral,
  referencedAssets,
  validateFrame,
  isRasterContentLayer,
} from '../src/document.ts';
import { layerBounds } from '../src/canvasSize.ts';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const embeddedId = '00000000-0000-4000-8000-000000000001';
const unusedId = '00000000-0000-4000-8000-000000000002';
const assets = {
  [embeddedId]: { url: png, w: 24, h: 12 },
  [unusedId]: { url: png, w: 1, h: 1 },
};
const smart = () => ({
  ...commonLayer('Product source'),
  kind: 'smart-object',
  asset: embeddedId,
  sourceName: 'product.png',
});
const frame = (layer = smart()) => ({
  w: 64,
  h: 64,
  layers: [layer],
  active: layer.id,
  selectedLayerIds: [layer.id],
});

test('smart objects validate as embedded source-retaining layers and report source bounds', () => {
  const layer = smart();
  assert.doesNotThrow(() => validateFrame(frame(layer), assets));
  assert.equal(isRasterContentLayer(layer), true);
  assert.deepEqual(layerBounds(layer, assets), { x: 0, y: 0, width: 24, height: 12 });
});

test('smart object metadata and immutable source reference survive JSON round trip', () => {
  const restored = JSON.parse(JSON.stringify(frame()));
  validateFrame(restored, assets);
  assert.equal(restored.layers[0].kind, 'smart-object');
  assert.equal(restored.layers[0].asset, embeddedId);
  assert.equal(restored.layers[0].sourceName, 'product.png');
  assert.deepEqual(restored.layers[0].adjustments, neutral);
});

test('referenced asset compaction keeps embedded smart-object source and drops unused assets', () => {
  const compacted = referencedAssets([frame()], assets);
  assert.deepEqual(Object.keys(compacted), [embeddedId]);
  assert.equal(compacted[embeddedId].url, png);
});

test('smart objects reject raster-only cleanup metadata and malformed source labels', () => {
  assert.throws(
    () => validateFrame(frame({ ...smart(), fillColor: '#ff0000' }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...smart(), sourceName: 'x'.repeat(161) }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...smart(), spotHealing: [] }), assets),
    /Invalid layer document/,
  );
});
