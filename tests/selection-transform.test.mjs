import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identity,
  selectionDecimal,
  selectionTransformMatrix,
  transformSelection,
  validMatrix,
} from '../src/document.ts';

const rectangle = {
  shape: 'rectangle',
  x: 10,
  y: 20,
  w: 40,
  h: 30,
  feather: 0,
  inverted: false,
};

test('selection transforms compose without mutating source geometry', () => {
  const translated = transformSelection(rectangle, [1, 0, 0, 1, 12, -4]);
  assert.deepEqual(translated.x, rectangle.x);
  assert.deepEqual(translated.y, rectangle.y);
  assert.deepEqual(translated.matrix, [1, 0, 0, 1, 12, -4]);
  const rotated = transformSelection(translated, [0, 1, -1, 0, 120, 0]);
  assert.deepEqual(rotated.matrix, [0, 1, -1, 0, 124, 12]);
  assert.deepEqual(rectangle.matrix, undefined);
});

test('selection transform matrix uses centre, scale, rotation and flips', () => {
  const matrix = selectionTransformMatrix(rectangle, {
    offsetX: 4,
    offsetY: -5,
    scaleX: 150,
    scaleY: 50,
    angle: 90,
    skewX: 0,
    skewY: 0,
    flipX: true,
    flipY: false,
  });
  assert.equal(validMatrix(matrix), true);
  // The transformed centre (30,35) moves to (34,30), independent of scale.
  assert.ok(Math.abs(matrix[4] + matrix[2] * 35 + matrix[0] * 30 - 34) < 1e-9);
  assert.ok(Math.abs(matrix[5] + matrix[1] * 30 + matrix[3] * 35 - 30) < 1e-9);
});

test('selection dialog decimal parser accepts locale comma and rejects junk', () => {
  assert.equal(selectionDecimal('  -12,5 '), -12.5);
  assert.equal(selectionDecimal('.75'), 0.75);
  assert.ok(Number.isNaN(selectionDecimal('12px')));
  assert.ok(Number.isNaN(selectionDecimal('')));
});

test('identity matrix is a valid no-op and singular transforms are rejected', () => {
  assert.equal(validMatrix(identity()), true);
  assert.throws(() => transformSelection(rectangle, [1, 0, 0, 0, 0, 0]), /Invalid selection transform/);
  assert.throws(() => selectionTransformMatrix(rectangle, {
    offsetX: 0,
    offsetY: 0,
    scaleX: 0,
    scaleY: 100,
    angle: 0,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
  }), /valid transform values/);
});
