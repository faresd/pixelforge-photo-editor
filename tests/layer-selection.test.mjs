import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SELECTED_LAYERS,
  combineSelectionBounds,
  normalizeLayerSelection,
  rangeLayerSelection,
  selectedLayerBounds,
  selectedLayerIdsForFrame,
  toggleLayerSelection,
  translateSelectedLayers,
  validSelectedLayerIds,
} from '../src/layerSelection.ts';
import { commonLayer, validateFrame } from '../src/document.ts';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];

const frame = (patch = {}) => ({
  w: 200,
  h: 120,
  layers: ids.map((id, index) => ({
    id,
    name: `Layer ${index + 1}`,
    matrix: [1, 0, 0, 1, index * 10, index * 5],
  })),
  active: ids[1],
  ...patch,
});

test('legacy selection normalizes to the active layer and explicit deselection survives', () => {
  assert.deepEqual(selectedLayerIdsForFrame(frame()), [ids[1]]);
  assert.deepEqual(normalizeLayerSelection(frame()).selectedLayerIds, [ids[1]]);
  assert.deepEqual(selectedLayerIdsForFrame(frame({ selectedLayerIds: [] })), []);
  assert.deepEqual(
    selectedLayerIdsForFrame(frame({ selectedLayerIds: [ids[3], ids[0]] })),
    [ids[0], ids[3]],
  );
  assert.throws(
    () => normalizeLayerSelection(frame({ selectedLayerIds: ['unknown'] })),
    /metadata/,
  );
});

test('selection validation is bounded, unique and tied to known layer IDs', () => {
  assert.equal(validSelectedLayerIds([], ids), true);
  assert.equal(validSelectedLayerIds([ids[0], ids[2]], ids), true);
  assert.equal(validSelectedLayerIds([ids[0], ids[0]], ids), false);
  assert.equal(validSelectedLayerIds([ids[0], 'unknown'], ids), false);
  assert.equal(validSelectedLayerIds(['legacy-a'], ['legacy-a', 'legacy-b']), true);
  assert.equal(
    validSelectedLayerIds(
      Array.from({ length: MAX_SELECTED_LAYERS + 1 }, (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ),
      [],
    ),
    false,
  );
});

test('single and additive toggles update active layer without mutating input', () => {
  const source = frame({ selectedLayerIds: [ids[0], ids[1]] });
  const single = toggleLayerSelection(source, ids[3]);
  assert.deepEqual(single.selectedLayerIds, [ids[3]]);
  assert.equal(single.active, ids[3]);
  assert.deepEqual(source.selectedLayerIds, [ids[0], ids[1]]);

  const added = toggleLayerSelection(source, ids[3], true);
  assert.deepEqual(added.selectedLayerIds, [ids[0], ids[1], ids[3]]);
  const removed = toggleLayerSelection(added, ids[1], true);
  assert.deepEqual(removed.selectedLayerIds, [ids[0], ids[3]]);
  const deselected = toggleLayerSelection(frame({ selectedLayerIds: [ids[1]] }), ids[1], true);
  assert.deepEqual(deselected.selectedLayerIds, []);
  assert.throws(() => toggleLayerSelection(source, 'missing'), /not in this frame/);
});

test('range selection is inclusive, deterministic and supports an explicit panel order', () => {
  const source = frame({ active: ids[1], selectedLayerIds: [ids[1]] });
  assert.deepEqual(rangeLayerSelection(source, ids[3]).selectedLayerIds, [ids[1], ids[2], ids[3]]);
  assert.deepEqual(rangeLayerSelection(source, ids[0]).selectedLayerIds, [ids[0], ids[1]]);
  assert.deepEqual(
    rangeLayerSelection(source, ids[3], [ids[3], ids[2], ids[1], ids[0]]).selectedLayerIds,
    [ids[1], ids[2], ids[3]],
  );
  assert.throws(() => rangeLayerSelection(source, ids[3], [ids[1], ids[1]]), /order/);
  assert.throws(() => rangeLayerSelection(source, 'missing'), /not in this frame/);
});

test('selected bounds combine measured layer rectangles independent of selection order', () => {
  const measured = {
    [ids[0]]: { x: 4, y: 20, width: 20, height: 10 },
    [ids[1]]: { x: -5, y: 8, width: 12, height: 40 },
    [ids[3]]: { x: 40, y: 16, width: 4, height: 4 },
  };
  const selected = frame({ selectedLayerIds: [ids[3], ids[1], ids[0]] });
  assert.deepEqual(selectedLayerBounds(selected, measured), { x: -5, y: 8, width: 49, height: 40 });
  assert.deepEqual(
    selectedLayerBounds(
      selected,
      Object.entries(measured).map(([id, value]) => ({ id, ...value })),
    ),
    { x: -5, y: 8, width: 49, height: 40 },
  );
  assert.deepEqual(selectedLayerBounds(selected, new Map(Object.entries(measured))), {
    x: -5,
    y: 8,
    width: 49,
    height: 40,
  });
  assert.deepEqual(combineSelectionBounds([]), null);
  assert.deepEqual(combineSelectionBounds([{ x: 4, y: 5, width: 0, height: 0 }]), { x: 4, y: 5, width: 0, height: 0 });
  assert.throws(() => combineSelectionBounds([{ x: 0, y: 0, width: -1, height: 1 }]), /bounds/);
});

test('translation changes only selected matrices and preserves source frame state', () => {
  const source = frame({ selectedLayerIds: [ids[0], ids[2]] });
  const moved = translateSelectedLayers(source, { x: 7.5, y: -3 });
  assert.deepEqual(moved.layers.map((layer) => layer.matrix), [
    [1, 0, 0, 1, 7.5, -3],
    [1, 0, 0, 1, 10, 5],
    [1, 0, 0, 1, 27.5, 7],
    [1, 0, 0, 1, 30, 15],
  ]);
  assert.deepEqual(source.layers[0].matrix, [1, 0, 0, 1, 0, 0]);
  assert.throws(() => translateSelectedLayers(source, { x: Infinity, y: 0 }), /translation/);
  assert.throws(() => translateSelectedLayers(source, { x: 16001, y: 0 }), /translation/);
});

test('Frame validation accepts explicit deselection and rejects unknown or duplicate IDs', () => {
  const assetId = '11111111-1111-4111-8111-111111111111';
  const layer = { ...commonLayer('Background'), kind: 'raster', asset: assetId };
  const assets = {
    [assetId]: {
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=',
      w: 1,
      h: 1,
    },
  };
  const base = { w: 1, h: 1, layers: [layer], active: layer.id, selectedLayerIds: [] };
  assert.doesNotThrow(() => validateFrame(base, assets));
  assert.throws(
    () => validateFrame({ ...base, selectedLayerIds: [layer.id, layer.id] }, assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame({ ...base, selectedLayerIds: ['00000000-0000-4000-8000-000000000099'] }, assets),
    /Invalid layer document/,
  );
});
