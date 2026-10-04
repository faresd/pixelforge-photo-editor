import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutral } from '../src/document.ts';
import { resolveArtboard } from '../src/artboardRender.ts';

const id = '00000000-0000-4000-8000-000000000001';
const frame = {
  w: 8,
  h: 6,
  layers: [{
    id,
    name: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    matrix: [1, 0, 0, 1, 0, 0],
    adjustments: structuredClone(neutral),
    kind: 'rectangle',
    width: 8,
    height: 6,
    color: '#ff0000',
    stroke: 1,
    fill: true,
  }],
  active: id,
};

test('artboard export resolves the active named viewport and returns a copy', () => {
  const named = {
    ...frame,
    artboards: [
      { id: 'hero', name: 'Hero', x: 1, y: 2, w: 4, h: 3, visible: true, locked: false },
      { id: 'social', name: 'Social', x: 0, y: 0, w: 8, h: 6, visible: true, locked: false },
    ],
    activeArtboardId: 'hero',
  };
  const result = resolveArtboard(named);
  assert.deepEqual(result, named.artboards[0]);
  result.name = 'changed';
  assert.equal(named.artboards[0].name, 'Hero');
  assert.deepEqual(resolveArtboard(named, 'social'), named.artboards[1]);
});

test('legacy frames resolve the full virtual Canvas viewport', () => {
  assert.deepEqual(resolveArtboard(frame), {
    id: 'artboard-canvas',
    name: 'Canvas',
    x: 0,
    y: 0,
    w: 8,
    h: 6,
    visible: true,
    locked: true,
  });
});

test('unknown and hidden export targets fail closed', () => {
  const named = {
    ...frame,
    artboards: [{ id: 'hidden', name: 'Hidden', x: 0, y: 0, w: 2, h: 2, visible: false, locked: false }],
    activeArtboardId: 'hidden',
  };
  assert.throws(() => resolveArtboard(named), /hidden/i);
  assert.throws(() => resolveArtboard(frame, 'missing'), /does not exist/i);
});
