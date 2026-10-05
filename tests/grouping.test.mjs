import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLayerMembers } from '../src/document.ts';

const id = (value) => `00000000-0000-4000-8000-00000000000${value}`;

const layer = (id, extra = {}) => ({
  id,
  name: id,
  kind: 'text',
  text: id,
  color: '#ffffff',
  fontSize: 20,
  fontFamily: 'Arial',
  bold: false,
  boxWidth: 100,
  textAlign: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  orientation: 'horizontal',
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: {},
  ...extra,
});

const frame = () => ({
  w: 100,
  h: 100,
  layers: [layer('bottom'), layer('middle'), layer('top'), layer('front')],
  active: 'top',
  selectedLayerIds: ['middle', 'front'],
});

test('grouping moves non-adjacent selected layers into one ordered block', () => {
  const original = frame();
  const grouped = groupLayerMembers(original, ['middle', 'front'], id(1));
  assert.deepEqual(grouped.layers.map((item) => item.id), [
    'bottom',
    'middle',
    'front',
    'top',
  ]);
  assert.deepEqual(
    grouped.layers.map((item) => item.groupId),
    [undefined, id(1), id(1), undefined],
  );
  assert.deepEqual(original.layers.map((item) => item.id), [
    'bottom',
    'middle',
    'top',
    'front',
  ]);
  assert.equal(original.layers[1].groupId, undefined);
  assert.equal(grouped.active, original.active);
  assert.deepEqual(grouped.selectedLayerIds, original.selectedLayerIds);
});

test('grouping anchors the block at the first selected stack position', () => {
  const original = {
    ...frame(),
    layers: [layer('a'), layer('b'), layer('c'), layer('d'), layer('e')],
  };
  const grouped = groupLayerMembers(original, ['b', 'd'], id(2));
  assert.deepEqual(grouped.layers.map((item) => item.id), [
    'a',
    'b',
    'd',
    'c',
    'e',
  ]);
  assert.deepEqual(
    grouped.layers.map((item) => item.groupId),
    [undefined, id(2), id(2), undefined, undefined],
  );
});

test('grouping rejects duplicate or missing layer ids without mutating the frame', () => {
  const original = frame();
  assert.throws(
    () => groupLayerMembers(original, ['middle', 'middle'], id(3)),
    /distinct layers/,
  );
  assert.throws(
    () => groupLayerMembers(original, ['missing'], id(3)),
    /missing/,
  );
  assert.throws(
    () => groupLayerMembers(original, ['middle'], ''),
    /Group id is invalid/,
  );
  assert.deepEqual(original.layers.map((item) => item.id), [
    'bottom',
    'middle',
    'top',
    'front',
  ]);
});
