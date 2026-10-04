import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  magneticEdgeStrength,
  magneticPathArea,
  snapMagneticPoint,
} from '../src/magneticLasso.ts';

function edgeImage(width = 12, height = 8) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = x < 6 ? 12 : 240;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

test('Magnetic Lasso snaps to the strongest nearby edge deterministically', () => {
  const data = edgeImage();
  const first = snapMagneticPoint(data, 12, 8, { x: 4.8, y: 3.2 }, 5);
  const second = snapMagneticPoint(data, 12, 8, { x: 4.8, y: 3.2 }, 5);
  assert.deepEqual(first, second);
  assert.ok(first.x === 5 || first.x === 6);
  assert.ok(magneticEdgeStrength(data, 12, 8, first) > magneticEdgeStrength(data, 12, 8, { x: 2, y: 3 }));
});

test('Magnetic Lasso bounds its search and rejects malformed inputs', () => {
  const data = edgeImage();
  assert.throws(() => snapMagneticPoint(data, 12, 8, { x: 2, y: 3 }, 0), /options are invalid/);
  assert.throws(() => magneticEdgeStrength(new Uint8ClampedArray(3), 12, 8, { x: 2, y: 3 }), /data does not match/);
});

test('Magnetic Lasso path area detects degenerate and closed selections', () => {
  assert.equal(magneticPathArea([{ x: 0, y: 0 }, { x: 2, y: 0 }]), 0);
  assert.equal(magneticPathArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]), 12);
});
