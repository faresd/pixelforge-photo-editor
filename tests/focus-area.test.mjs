import test from 'node:test';
import assert from 'node:assert/strict';
import { focusAreaMask } from '../src/focusArea.ts';
test('focus area selects strong local luminance edges', () => { const source = new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,255,255,255,0,0,0,255]); const mask = focusAreaMask(source, { width: 2, height: 2, threshold: 100, softness: 0 }); assert.equal(mask[0], 255); assert.equal(mask[1], 255); });
test('focus area preserves transparent pixels and is deterministic', () => { const source = new Uint8ClampedArray([255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,255]); const first = focusAreaMask(source, { width: 2, height: 2, threshold: 20, softness: 20 }); const second = focusAreaMask(source, { width: 2, height: 2, threshold: 20, softness: 20 }); assert.equal(first[0], 0); assert.deepEqual(first, second); });
test('focus area validates bounds', () => { assert.throws(() => focusAreaMask(new Uint8ClampedArray(4), { width: 1, height: 1, threshold: 256 })); assert.throws(() => focusAreaMask(new Uint8ClampedArray(4), { width: 1, height: 1, softness: -1 })); });
