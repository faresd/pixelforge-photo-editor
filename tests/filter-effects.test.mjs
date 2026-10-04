import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  neutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fn(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

const fixture = () => rgba(9, 5, (x, y) => [x * 22, y * 38, (x + y) * 12, x === 0 && y === 0 ? 0 : 255]);

test('Filter effect metadata is bounded and legacy/empty values normalize safely', () => {
  const value = effectiveFilterEffects({ type: 'mosaic', amount: 200, radius: -4, centerX: 4, seed: -1 });
  assert.equal(value.type, 'mosaic');
  assert.deepEqual({ amount: value.amount, radius: value.radius, centerX: value.centerX, seed: value.seed }, { amount: 100, radius: 0, centerX: 1, seed: 0xffffffff });
  assert.equal(effectiveFilterEffects(undefined).type, 'none');
  assert.equal(isNeutralFilterEffects(neutralFilterEffects), true);
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, radius: 1.5 }), false);
});

test('field blur is deterministic, source-safe and alpha-safe', () => {
  const source = fixture();
  const original = source.slice();
  const first = applyFilterEffectsPixels(source, 9, 5, { type: 'field-blur', amount: 100, radius: 2 });
  const second = applyFilterEffectsPixels(source, 9, 5, { type: 'field-blur', amount: 100, radius: 2 });
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 9, 0, 0).slice(0, 3), pixel(source, 9, 0, 0).slice(0, 3));
  assert.notDeepEqual(pixel(first, 9, 1, 0), pixel(source, 9, 1, 0));
});

test('box and Gaussian blur are deterministic editable effects with bounded metadata', () => {
  const normalized = effectiveFilterEffects({
    type: 'gaussian-blur',
    amount: 140,
    radius: 99,
  });
  assert.deepEqual(
    {
      type: normalized.type,
      amount: normalized.amount,
      radius: normalized.radius,
    },
    { type: 'gaussian-blur', amount: 100, radius: 64 },
  );
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(
    validFilterEffects({ ...normalized, type: 'box-blur', radius: 1.5 }),
    false,
  );

  const source = rgba(9, 1, (x) => {
    if (x === 0) return [77, 66, 55, 0];
    return [x === 4 ? 255 : 0, 0, 0, 255];
  });
  const original = source.slice();
  const box = applyFilterEffectsPixels(source, 9, 1, {
    type: 'box-blur',
    amount: 100,
    radius: 2,
  });
  const gaussian = applyFilterEffectsPixels(source, 9, 1, {
    type: 'gaussian-blur',
    amount: 100,
    radius: 2,
  });
  assert.deepEqual(source, original);
  assert.deepEqual(box, applyFilterEffectsPixels(source, 9, 1, {
    type: 'box-blur',
    amount: 100,
    radius: 2,
  }));
  assert.deepEqual(gaussian, applyFilterEffectsPixels(source, 9, 1, {
    type: 'gaussian-blur',
    amount: 100,
    radius: 2,
  }));
  assert.notDeepEqual(box, gaussian);
  assert.ok(box[(4 * 4) + 0] < 255);
  assert.ok(gaussian[(3 * 4) + 0] > 0);
  assert.equal(pixel(gaussian, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(gaussian, 9, 0, 0).slice(0, 3), [77, 66, 55]);
  for (let x = 1; x < 9; x += 1)
    assert.equal(pixel(gaussian, 9, x, 0)[3], 255);
});

test('motion blur is a deterministic directional effect with source-safe alpha handling', () => {
  const source = rgba(11, 3, (x, y) => {
    if (x === 5 && y === 1) return [255, 20, 10, 255];
    if (x === 0) return [17, 28, 39, 0];
    return [0, 0, 0, 255];
  });
  const original = source.slice();
  const effect = { type: 'motion-blur', amount: 100, radius: 2, angle: 0 };
  const first = applyFilterEffectsPixels(source, 11, 3, effect);
  const second = applyFilterEffectsPixels(source, 11, 3, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 11, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 11, 0, 0).slice(0, 3), [17, 28, 39]);
  assert.ok(pixel(first, 11, 5, 1)[0] < 255);
  assert.ok(pixel(first, 11, 4, 1)[0] > 0);
  assert.equal(pixel(first, 11, 5, 1)[3], 255);
});

test('radial blur is a deterministic spin effect with editable centre and alpha safety', () => {
  const source = rgba(15, 15, (x, y) => {
    if (x === 0 && y === 0) return [31, 42, 53, 0];
    return [(x * 19 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 255];
  });
  const original = source.slice();
  const effect = {
    type: 'radial-blur',
    amount: 100,
    radius: 48,
    centerX: 0.5,
    centerY: 0.5,
  };
  const first = applyFilterEffectsPixels(source, 15, 15, effect);
  const second = applyFilterEffectsPixels(source, 15, 15, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 15, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 15, 0, 0).slice(0, 3), [31, 42, 53]);
  assert.notDeepEqual(pixel(first, 15, 2, 2), pixel(source, 15, 2, 2));
  assert.equal(pixel(first, 15, 7, 7)[3], 255);
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
});

test('radial blur normalizes bounds, preserves its exact centre and follows centre changes', () => {
  const value = effectiveFilterEffects({
    type: 'radial-blur',
    radius: 500,
    amount: 130,
    centerX: -2,
    centerY: 9,
  });
  assert.deepEqual(
    { type: value.type, radius: value.radius, amount: value.amount, centerX: value.centerX, centerY: value.centerY },
    { type: 'radial-blur', radius: 64, amount: 100, centerX: 0, centerY: 1 },
  );
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, centerX: -0.01 }), false);
  assert.equal(validFilterEffects({ ...value, radius: 1.2 }), false);

  const source = rgba(13, 13, (x, y) => [(x * 37 + y * 7) % 256, x * 13, y * 17, 255]);
  const effect = { type: 'radial-blur', radius: 50, amount: 100, centerX: 0.5, centerY: 0.5 };
  const centred = applyFilterEffectsPixels(source, 13, 13, effect);
  assert.deepEqual(pixel(centred, 13, 6, 6), pixel(source, 13, 6, 6));
  assert.notDeepEqual(
    centred,
    applyFilterEffectsPixels(source, 13, 13, { ...effect, centerX: 0.1, centerY: 0.2 }),
  );
});

test('radial blur preserves constant colour and excludes hidden transparent colours', () => {
  const source = rgba(7, 7, (x, y) => {
    if (x === 0 || y === 0) return [0, 255, 0, 0];
    return [120, 60, 30, (x + y) % 2 ? 127 : 255];
  });
  const result = applyFilterEffectsPixels(source, 7, 7, {
    type: 'radial-blur', amount: 100, radius: 64, centerX: 0, centerY: 0,
  });
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const value = pixel(result, 7, x, y);
      assert.equal(value[3], pixel(source, 7, x, y)[3]);
      assert.deepEqual(value.slice(0, 3), x === 0 || y === 0 ? [0, 255, 0] : [120, 60, 30]);
    }
  }
});

test('radial blur identity controls and tiny canvases always return a fresh safe buffer', () => {
  const source = new Uint8ClampedArray([12, 34, 56, 127]);
  for (const effect of [
    { type: 'radial-blur', amount: 100, radius: 64, centerX: 0, centerY: 1 },
    { type: 'radial-blur', amount: 0, radius: 64 },
    { type: 'radial-blur', amount: 100, radius: 0 },
  ]) {
    const result = applyFilterEffectsPixels(source, 1, 1, effect);
    assert.notEqual(result, source);
    assert.deepEqual(result, source);
  }
  const sourceLine = rgba(1, 9, (_x, y) => [y * 27, 50, 100, 255]);
  const resultLine = applyFilterEffectsPixels(sourceLine, 1, 9, {
    type: 'radial-blur', amount: 100, radius: 64, centerX: 1, centerY: 0,
  });
  assert.equal(resultLine.length, sourceLine.length);
  for (let y = 0; y < 9; y += 1) assert.equal(pixel(resultLine, 1, 0, y)[3], 255);
});

test('blur identity and tiny-canvas boundaries preserve source and alpha', () => {
  const source = new Uint8ClampedArray([12, 34, 56, 127]);
  for (const type of ['box-blur', 'gaussian-blur']) {
    assert.deepEqual(
      applyFilterEffectsPixels(source, 1, 1, { type, amount: 100, radius: 64 }),
      source,
    );
    assert.deepEqual(
      applyFilterEffectsPixels(source, 1, 1, { type, amount: 100, radius: 0 }),
      source,
    );
  }
  assert.deepEqual(
    applyFilterEffectsPixels(source, 1, 1, {
      type: 'gaussian-blur',
      amount: 0,
      radius: 64,
    }),
    source,
  );
});

test('tilt shift keeps the focus band sharper than distant pixels', () => {
  const source = rgba(15, 15, (x, y) => [(x * 17 + y * 3) % 256, (x * 5 + y * 21) % 256, (x * 11 + y * 13) % 256, 255]);
  const result = applyFilterEffectsPixels(source, 15, 15, { type: 'tilt-shift', amount: 100, radius: 2, centerY: 0.5 });
  const centreDifference = pixel(result, 15, 7, 7).reduce((sum, v, i) => sum + Math.abs(v - pixel(source, 15, 7, 7)[i]), 0);
  const edgeDifference = pixel(result, 15, 7, 0).reduce((sum, v, i) => sum + Math.abs(v - pixel(source, 15, 7, 0)[i]), 0);
  assert.ok(edgeDifference > centreDifference);
});

test('mosaic and halftone operate by bounded cells without touching alpha', () => {
  const source = rgba(8, 4, (x, y) => [x < 4 ? 250 : 10, y * 50, x * 20, 120 + x * 10]);
  const mosaic = applyFilterEffectsPixels(source, 8, 4, { type: 'mosaic', amount: 100, radius: 4 });
  const half = applyFilterEffectsPixels(source, 8, 4, { type: 'color-halftone', amount: 100, radius: 4 });
  assert.deepEqual(pixel(mosaic, 8, 0, 0).slice(3), pixel(source, 8, 0, 0).slice(3));
  assert.deepEqual(pixel(half, 8, 7, 3).slice(3), pixel(source, 8, 7, 3).slice(3));
  assert.equal(new Set([pixel(mosaic, 8, 0, 0).slice(0, 3).join(','), pixel(mosaic, 8, 3, 3).slice(0, 3).join(',')]).size, 1);
  assert.notDeepEqual(half, source);
});

test('ripple and twirl are stable remaps and retain transparent pixels', () => {
  const source = fixture();
  for (const type of ['ripple', 'twirl']) {
    const effect = { type, amount: 85, radius: 3, angle: 80, centerX: 0.5, centerY: 0.5 };
    const result = applyFilterEffectsPixels(source, 9, 5, effect);
    assert.deepEqual(result, applyFilterEffectsPixels(source, 9, 5, effect));
    assert.deepEqual(pixel(result, 9, 0, 0), pixel(source, 9, 0, 0));
    assert.equal(result.some((value, index) => value !== source[index]), true);
  }
});

test('invalid buffer dimensions fail closed', () => {
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(3), 1, 1, { type: 'mosaic', amount: 1, radius: 2 }), /length/);
});
