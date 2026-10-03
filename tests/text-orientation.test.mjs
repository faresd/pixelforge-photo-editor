import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawTextLayer,
  effectiveTextLayer,
  neutral,
  TEXT_ORIENTATIONS,
  validateFrame,
} from '../src/document.ts';

const id = '11111111-1111-4111-8111-111111111111';
const textLayer = (patch = {}) => ({
  id,
  name: 'Vertical title',
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: structuredClone(neutral),
  kind: 'text',
  text: 'AB\nCD',
  color: '#000000',
  fontSize: 20,
  fontFamily: 'Arial',
  bold: false,
  boxWidth: 100,
  textAlign: 'left',
  lineHeight: 1.2,
  letterSpacing: 2,
  ...patch,
});

test('legacy text normalizes to horizontal while vertical is an explicit persisted mode', () => {
  assert.deepEqual([...TEXT_ORIENTATIONS], ['horizontal', 'vertical']);
  const legacy = effectiveTextLayer(textLayer({ orientation: undefined }), 100);
  assert.equal(legacy.orientation, 'horizontal');
  assert.doesNotThrow(() => validateFrame({
    w: 100,
    h: 100,
    layers: [textLayer({ orientation: 'vertical' })],
    active: id,
  }, {}));
  assert.throws(() => validateFrame({
    w: 100,
    h: 100,
    layers: [textLayer({ orientation: 'diagonal' })],
    active: id,
  }, {}), /Invalid layer document/);
});

test('vertical text advances glyphs down each column and starts new lines in a new column', () => {
  const calls = [];
  const context = {
    fillText: (glyph, x, y) => calls.push({ glyph, x, y }),
  };
  drawTextLayer(context, textLayer({ orientation: 'vertical' }));
  assert.deepEqual(calls, [
    { glyph: 'A', x: 0, y: 0 },
    { glyph: 'B', x: 0, y: 22 },
    { glyph: 'C', x: 24, y: 0 },
    { glyph: 'D', x: 24, y: 22 },
  ]);
});
