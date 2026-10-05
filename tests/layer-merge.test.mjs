import test from 'node:test';
import assert from 'node:assert/strict';
import { layerMergeReason, planLayerMerge } from '../src/layerMerge.ts';

const frame = (patch = {}) => ({
  w: 8,
  h: 8,
  layers: [
    { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
    { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
  ],
  active: 'active',
  ...patch,
});

test('plans an adjacent visible unlocked ungrouped pair in stack order', () => {
  assert.deepEqual(planLayerMerge(frame()), { ok: true, activeIndex: 1, lowerIndex: 0 });
});

test('rejects missing, bottom and locked or hidden layer states', () => {
  assert.equal(planLayerMerge(frame({ active: 'missing' })).reason, 'missing-active');
  assert.equal(planLayerMerge(frame({ active: 'bottom' })).reason, 'no-lower-layer');
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: false, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
    ] })).reason,
    'lower-layer-hidden',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: true },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
    ] })).reason,
    'lower-layer-locked',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: false, locked: false },
    ] })).reason,
    'active-layer-hidden',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false, groupId: 'folder' },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false, groupId: 'folder' },
    ] })).reason,
    'grouped-layers',
  );
});

test('guard reasons are user-facing and identify the staged boundary', () => {
  assert.match(layerMergeReason('grouped-layers'), /isolated folder compositing/);
  assert.match(layerMergeReason('no-lower-layer'), /above another layer/);
});
