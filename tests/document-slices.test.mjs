import test from 'node:test';
import assert from 'node:assert/strict';
import { transformFrame } from '../src/document.ts';

test('canvas transforms clear stale artboard and slice pointers when no viewport survives', () => {
  const frame = {
    w: 10,
    h: 10,
    layers: [],
    active: 'layer',
    artboards: [{
      id: 'hero', name: 'Hero', x: 2, y: 2, w: 4, h: 4,
      visible: true, locked: false,
    }],
    activeArtboardId: 'hero',
    slices: [{ id: 'slice', name: 'Slice', x: 2, y: 2, width: 4, height: 4 }],
    activeSliceId: 'slice',
  };
  const next = transformFrame(frame, [1, 0, 0, 1, -20, 0], 10, 10);
  assert.deepEqual(next.artboards, []);
  assert.equal(next.activeArtboardId, undefined);
  assert.deepEqual(next.slices, []);
  assert.equal(next.activeSliceId, undefined);
  assert.equal(frame.activeArtboardId, 'hero');
  assert.equal(frame.activeSliceId, 'slice');
});

