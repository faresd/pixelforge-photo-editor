import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterLayersBySearch,
  groupMatchesSearch,
  layerMatchesSearch,
  layerSearchText,
  normalizeLayerSearchQuery,
} from '../src/layerSearch.ts';

const layers = [
  { id: 'raster-1', name: 'Sky Photo', kind: 'raster', visible: true, locked: false },
  { id: 'text-1', name: 'Title', kind: 'text', visible: false, locked: true, groupId: 'group-1' },
  { id: 'shape-1', name: 'Accent Star', kind: 'polygon', visible: true, locked: false, groupId: 'group-1' },
];
const groups = [{ id: 'group-1', name: 'Brand assets', visible: true, locked: false }];

test('layer search normalization is bounded, trimmed and case-insensitive', () => {
  assert.equal(normalizeLayerSearchQuery('  SKY PHOTO  '), 'sky photo');
  assert.equal(normalizeLayerSearchQuery(42), '');
  assert.equal(normalizeLayerSearchQuery('x'.repeat(200)).length, 160);
});

test('layer search indexes names, kinds, groups and visibility/lock state', () => {
  assert.match(layerSearchText(layers[1], groups[0]), /title text hidden locked brand assets/);
  assert.equal(layerMatchesSearch(layers[1], groups[0], 'hidden text'), true);
  assert.equal(layerMatchesSearch(layers[1], groups[0], 'visible'), false);
  assert.equal(layerMatchesSearch(layers[2], groups[0], 'brand star'), true);
  assert.equal(layerMatchesSearch(layers[2], groups[0], 'unlocked'), true);
  assert.equal(layerMatchesSearch(layers[2], groups[0], 'locked'), false);
  assert.equal(groupMatchesSearch(groups[0], 'brand'), true);
});

test('filtering matches all tokens, preserves stack order and never mutates inputs', () => {
  const snapshot = layers.map((layer) => ({ ...layer }));
  assert.deepEqual(
    filterLayersBySearch(layers, groups, 'BRAND polygon'),
    [layers[2]],
  );
  assert.deepEqual(filterLayersBySearch(layers, groups, ''), layers);
  assert.deepEqual(filterLayersBySearch(layers, groups, 'missing'), []);
  assert.deepEqual(layers, snapshot);
});
