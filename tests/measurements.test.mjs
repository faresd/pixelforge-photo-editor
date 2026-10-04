import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMeasurement,
  measurementAngle,
  measurementDistance,
  nextCountIndex,
  validMeasurements,
} from '../src/measurements.ts';

test('ruler geometry is deterministic and human-readable', () => {
  const start = { x: 1, y: 2 }, end = { x: 4, y: 6 };
  assert.equal(measurementDistance(start, end), 5);
  assert.equal(measurementAngle(start, end), 53.1);
  assert.equal(formatMeasurement(5, 53.1), '5.0 px · 53.1°');
});

test('count markers choose the next stable index', () => {
  assert.equal(
    nextCountIndex([
      { id: 'a', kind: 'count', x: 1, y: 1, index: 4 },
      { id: 'b', kind: 'sample', x: 2, y: 2, color: '#ffffff', alpha: 255 },
    ]),
    5,
  );
  assert.equal(nextCountIndex([]), 1);
});

test('measurement validation bounds coordinates and protects note content', () => {
  const value = [
    { id: 's', kind: 'sample', x: 2, y: 3, color: '#12aBc3', alpha: 128 },
    { id: 'r', kind: 'ruler', start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, pixels: 5, angle: 53.1 },
    { id: 'n', kind: 'note', x: 4, y: 5, text: 'Keep this edge' },
    { id: 'c', kind: 'count', x: 6, y: 7, index: 1 },
  ];
  assert.equal(validMeasurements(value, 10, 10), true);
  assert.equal(validMeasurements([{ ...value[0], x: 11 }], 10, 10), false);
  assert.equal(validMeasurements([{ ...value[2], text: '\u0000bad' }], 10, 10), false);
  assert.equal(validMeasurements([{ ...value[3], index: 0 }], 10, 10), false);
  assert.equal(validMeasurements(undefined, 10, 10), true);
});
