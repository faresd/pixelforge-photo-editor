import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginPerformanceSpan,
  resetPerformanceSpanIds,
} from '../src/performanceMarks.ts';

test.beforeEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
  resetPerformanceSpanIds();
});

test('operation spans emit unique timing measures and stable latest marks', () => {
  const first = beginPerformanceSpan('render');
  const second = beginPerformanceSpan('render');
  first.finish();
  first.finish();
  second.finish();

  const measures = performance.getEntriesByName('pixelforge.render');
  assert.equal(measures.length, 2);
  assert.ok(measures.every((entry) => entry.duration >= 0));
  assert.equal(performance.getEntriesByName('pixelforge.render.latest').length, 2);
  assert.equal(performance.getEntriesByName('pixelforge.render.start.1').length, 1);
  assert.equal(performance.getEntriesByName('pixelforge.render.start.2').length, 1);
});

test('cancelled operations never publish a misleading completed measure', () => {
  const span = beginPerformanceSpan('save');
  span.cancel();
  span.finish();

  assert.equal(performance.getEntriesByName('pixelforge.save').length, 0);
  assert.equal(performance.getEntriesByName('pixelforge.save.latest').length, 0);
  assert.equal(performance.getEntriesByName('pixelforge.save.cancelled').length, 1);
});

test('invalid operation labels are isolated to the unknown channel', () => {
  const span = beginPerformanceSpan('bad label with spaces');
  span.finish();
  assert.equal(performance.getEntriesByName('pixelforge.unknown').length, 1);
  assert.equal(performance.getEntriesByName('pixelforge.bad label with spaces').length, 0);
});
