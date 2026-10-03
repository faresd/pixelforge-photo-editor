import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IMAGE_SIZE,
  effectiveImageSize,
  imageSizeDecimal,
  imageSizeMegapixels,
  imageSizeToPixels,
  pixelsToImageSize,
  planImageSize,
  resolutionInPpi,
  validImageSizeMetadata,
} from '../src/imageSize.ts';
import { identity, transformFrame } from '../src/document.ts';

test('image-size decimal parser accepts dot/comma and rejects units', () => {
  assert.equal(imageSizeDecimal(' 115,15 '), 115.15);
  assert.equal(imageSizeDecimal('.5'), 0.5);
  assert.ok(Number.isNaN(imageSizeDecimal('12 px')));
  assert.ok(Number.isNaN(imageSizeDecimal('')));
});

test('physical units round trip through resolution metadata', () => {
  const meta = { resolution: 72, resolutionUnit: 'ppi' };
  assert.equal(resolutionInPpi(72, 'ppi'), 72);
  assert.equal(resolutionInPpi(10, 'ppcm'), 25.4);
  assert.ok(Math.abs(imageSizeToPixels(1, 'inches', meta) - 72) < 1e-9);
  assert.ok(Math.abs(imageSizeToPixels(2.54, 'centimeters', meta) - 72) < 1e-9);
  assert.ok(Math.abs(pixelsToImageSize(72, 'millimeters', meta) - 25.4) < 1e-9);
});

test('metadata normalization is backwards compatible and bounded', () => {
  assert.deepEqual(effectiveImageSize(undefined), DEFAULT_IMAGE_SIZE);
  assert.deepEqual(effectiveImageSize({ resolution: 300, resolutionUnit: 'ppi' }), {
    resolution: 300,
    resolutionUnit: 'ppi',
  });
  assert.equal(validImageSizeMetadata({ resolution: 1, resolutionUnit: 'ppcm' }), true);
  assert.equal(validImageSizeMetadata({ resolution: 0, resolutionUnit: 'ppi' }), false);
  assert.equal(validImageSizeMetadata({ resolution: 2401, resolutionUnit: 'ppi' }), false);
});

test('resample-off keeps pixel dimensions while changing print metadata', () => {
  const plan = planImageSize(3264, 1936, undefined, {
    width: 115.15,
    height: 68.3,
    widthUnit: 'centimeters',
    heightUnit: 'centimeters',
    resolution: 72,
    resolutionUnit: 'ppi',
    resample: false,
    method: 'automatic',
  });
  assert.equal(plan.width, 3264);
  assert.equal(plan.height, 1936);
  assert.deepEqual(plan.imageSize, { resolution: 72, resolutionUnit: 'ppi' });
  assert.equal(plan.resample, false);
});

test('resample-on converts physical units and rounds to safe pixels', () => {
  const plan = planImageSize(720, 480, undefined, {
    width: 10,
    height: 5,
    widthUnit: 'inches',
    heightUnit: 'inches',
    resolution: 72,
    resolutionUnit: 'ppi',
    resample: true,
    method: 'bilinear',
  });
  assert.equal(plan.width, 720);
  assert.equal(plan.height, 360);
  assert.equal(plan.method, 'bilinear');
});

test('resample rejects impossible dimensions and malformed requests', () => {
  const base = {
    width: 16000,
    height: 16000,
    widthUnit: 'pixels',
    heightUnit: 'pixels',
    resolution: 72,
    resolutionUnit: 'ppi',
    resample: true,
    method: 'automatic',
  };
  assert.throws(() => planImageSize(100, 100, undefined, base), /16 megapixels/);
  assert.throws(() => planImageSize(100, 100, undefined, { ...base, resolution: 0 }), /Resolution/);
  assert.throws(() => planImageSize(100, 100, undefined, { ...base, method: 'box' }), /invalid/);
});

test('megapixel estimate is deterministic', () => {
  assert.equal(imageSizeMegapixels(3264, 1936), 6.319104);
});

test('document transforms retain resolution metadata and legacy frames default safely', () => {
  const layer = {
    id: '00000000-0000-0000-0000-000000000001', name: 'Shape', visible: true,
    locked: false, opacity: 1, blend: 'source-over', matrix: identity(),
    adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filter: 'none', levelsBlack: 0, levelsWhite: 255, levelsGamma: 1,
      colorBalance: { shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, preserveLuminosity: true },
      sharpenNoise: { amount: 0, radius: 1, threshold: 0, noise: 0, monochromatic: false, seed: 1 }, curves: { rgb: [[0, 0], [255, 255]], red: [[0, 0], [255, 255]], green: [[0, 0], [255, 255]], blue: [[0, 0], [255, 255]] } },
    kind: 'rectangle', width: 10, height: 10, color: '#000000', stroke: 1, fill: true,
  };
  const frame = { w: 100, h: 80, layers: [layer], active: layer.id };
  assert.deepEqual(transformFrame(frame, identity()).imageSize, DEFAULT_IMAGE_SIZE);
  const print = { ...frame, imageSize: { resolution: 300, resolutionUnit: 'ppi' } };
  assert.deepEqual(transformFrame(print, identity()).imageSize, print.imageSize);
});
