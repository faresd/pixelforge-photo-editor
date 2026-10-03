import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_ANCHORS,
  canvasSizeImageMetadata,
  findTrimBounds,
  layerBounds,
  layerLocalBounds,
  noOpCanvasSize,
  planCanvasSize,
  planRevealAll,
  planTrim,
  measuredTextLayerBounds,
  trimBounds,
} from '../src/canvasSize.ts';
import { identity } from '../src/document.ts';

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const adjustments = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filter: 'none',
  levelsBlack: 0, levelsWhite: 255, levelsGamma: 1,
  colorBalance: { shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, preserveLuminosity: true },
  sharpenNoise: { amount: 0, radius: 1, threshold: 0, noise: 0, monochromatic: false, seed: 1 },
  curves: { rgb: [[0, 0], [255, 255]], red: [[0, 0], [255, 255]], green: [[0, 0], [255, 255]], blue: [[0, 0], [255, 255]] },
};
const layer = (patch) => ({ id: id(1), name: 'layer', visible: true, locked: false, opacity: 1, blend: 'source-over', matrix: identity(), adjustments, kind: 'rectangle', width: 10, height: 10, color: '#ff0000', stroke: 1, fill: true, ...patch });
const raster = (patch) => ({ id: id(2), name: 'raster', visible: true, locked: false, opacity: 1, blend: 'source-over', matrix: identity(), adjustments, kind: 'raster', asset: 'asset', ...patch });
const assets = { asset: { url: 'data:image/png;base64,', w: 100, h: 60 } };
const rgba = (width, height, fill = [0, 0, 0, 0]) => new Uint8ClampedArray(width * height * 4).fill(0).map((_, i) => fill[i % 4]);

 test('Canvas Size exposes all nine Photoshop anchor positions', () => {
  assert.deepEqual(CANVAS_ANCHORS, ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']);
  for (const anchor of CANVAS_ANCHORS) {
    const plan = planCanvasSize(100, 80, { width: 200, height: 160, anchor });
    assert.equal(plan.width, 200); assert.equal(plan.height, 160); assert.equal(plan.changed, true);
  }
});

test('Canvas Size expands around each anchor with deterministic integer offsets', () => {
  assert.deepEqual(planCanvasSize(100, 80, { width: 201, height: 161, anchor: 'center' }).matrix, [1, 0, 0, 1, 50, 40]);
  assert.deepEqual(planCanvasSize(100, 80, { width: 201, height: 161, anchor: 'bottom-right' }).matrix, [1, 0, 0, 1, 101, 81]);
  assert.deepEqual(planCanvasSize(100, 80, { width: 201, height: 161, anchor: 'top-left' }).matrix, [1, 0, 0, 1, 0, 0]);
});

test('Canvas Size contracts toward the selected anchor without scaling pixels', () => {
  assert.deepEqual(planCanvasSize(100, 80, { width: 40, height: 30, anchor: 'top-left' }).matrix, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(planCanvasSize(100, 80, { width: 40, height: 30, anchor: 'center' }).matrix, [1, 0, 0, 1, -30, -25]);
  assert.deepEqual(planCanvasSize(100, 80, { width: 40, height: 30, anchor: 'bottom-right' }).matrix, [1, 0, 0, 1, -60, -50]);
});

test('Canvas Size validates dimensions, anchors and no-op behavior', () => {
  assert.equal(planCanvasSize(100, 80, { width: 100, height: 80, anchor: 'center' }).changed, false);
  assert.deepEqual(noOpCanvasSize(100, 80).matrix, identity());
  assert.throws(() => planCanvasSize(100, 80, { width: 0, height: 80, anchor: 'center' }), /whole dimensions/);
  assert.throws(() => planCanvasSize(100, 80, { width: 100, height: 80, anchor: 'bad' }), /anchor/);
  assert.throws(() => planCanvasSize(16000, 16000, { width: 16000, height: 16000, anchor: 'center' }), /16 megapixels/);
});

test('findTrimBounds trims transparent margins and reports an all-transparent image', () => {
  const pixels = rgba(5, 4);
  const set = (x, y, color) => pixels.set(color, (y * 5 + x) * 4);
  set(2, 1, [10, 20, 30, 255]); set(3, 2, [10, 20, 30, 128]);
  assert.deepEqual(findTrimBounds(pixels, 5, 4, { mode: 'transparent' }), { x: 2, y: 1, width: 2, height: 2 });
  assert.equal(findTrimBounds(rgba(2, 2), 2, 2, { mode: 'transparent' }), null);
  assert.throws(() => findTrimBounds([0, 0, 0, NaN], 1, 1, { mode: 'transparent' }), /8-bit/);
});

test('findTrimBounds trims top-left and explicit colors with tolerance', () => {
  const pixels = rgba(4, 3, [255, 255, 255, 255]);
  pixels.set([250, 250, 250, 255], (1 * 4 + 1) * 4);
  pixels.set([1, 2, 3, 255], (1 * 4 + 2) * 4);
  assert.deepEqual(findTrimBounds(pixels, 4, 3, { mode: 'top-left', tolerance: 0 }), { x: 1, y: 1, width: 2, height: 1 });
  assert.deepEqual(findTrimBounds(pixels, 4, 3, { mode: 'color', color: [255, 255, 255, 255], tolerance: 10 }), { x: 2, y: 1, width: 1, height: 1 });
  assert.throws(() => findTrimBounds(pixels, 4, 3, { mode: 'color', color: [0, 0, 0], tolerance: 0 }), /color/);
});

test('trimBounds supports all corner samples and per-side preservation', () => {
  const pixels = rgba(4, 3, [255, 255, 255, 255]);
  pixels.set([1, 2, 3, 255], (1 * 4 + 1) * 4);
  pixels.set([9, 8, 7, 255], (1 * 4 + 2) * 4);
  for (const mode of ['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    assert.deepEqual(trimBounds(pixels, 4, 3, mode, { top: true, left: true, bottom: true, right: true }), { left: 1, top: 1, right: 3, bottom: 2 });
  assert.deepEqual(trimBounds(pixels, 4, 3, 'top-left', { top: false, left: true, bottom: false, right: true }), { left: 1, top: 0, right: 3, bottom: 3 });
  assert.equal(trimBounds(pixels, 4, 3, 'top-left', { top: true, left: true, bottom: true, right: false }).right, 4);
});

test('planTrim returns translation, bounds, mode and rejects destructive empty trims', () => {
  const pixels = rgba(4, 3);
  pixels.set([1, 2, 3, 255], (1 * 4 + 1) * 4);
  const plan = planTrim(4, 3, pixels, { mode: 'transparent' });
  assert.deepEqual(plan.bounds, { x: 1, y: 1, width: 1, height: 1 });
  assert.deepEqual(plan.matrix, [1, 0, 0, 1, -1, -1]);
  assert.equal(plan.mode, 'transparent'); assert.equal(plan.changed, true);
  assert.throws(() => planTrim(2, 2, rgba(2, 2), { mode: 'transparent' }), /entire image/);
});

test('Reveal All includes transformed visible layers and excludes hidden layers by default', () => {
  const visible = raster({ matrix: [1, 0, 0, 1, -30, -10] });
  const hidden = raster({ id: id(3), visible: false, matrix: [1, 0, 0, 1, 500, 500] });
  const frame = { w: 100, h: 80, layers: [visible, hidden] };
  const plan = planRevealAll(frame, assets);
  assert.deepEqual(plan.bounds, { x: -30, y: -10, width: 130, height: 90 });
  assert.deepEqual(plan.matrix, [1, 0, 0, 1, 30, 10]);
  assert.deepEqual(plan.includedLayerIds, [visible.id]);
  const withHidden = planRevealAll(frame, assets, { includeHidden: true });
  assert.equal(withHidden.includedLayerIds.length, 2);
  assert.equal(withHidden.width, 630); assert.equal(withHidden.height, 570);
});

test('Reveal All respects hidden and transparent folders unless explicitly requested', () => {
  const grouped = raster({ id: id(5), groupId: id(9), matrix: [1, 0, 0, 1, -500, 0] });
  const frame = { w: 100, h: 80, layers: [grouped], groups: [{ id: id(9), name: 'Hidden folder', visible: false, locked: false, opacity: 1, blend: 'source-over', collapsed: false }] };
  assert.equal(planRevealAll(frame, assets).changed, false);
  assert.equal(planRevealAll(frame, assets, { includeHidden: true }).changed, true);
});

test('Reveal All handles rotated/vector/text layers and returns a no-op when contained', () => {
  const shape = layer({ matrix: [0, 1, -1, 0, 90, 10], width: 20, height: 10 });
  const text = layer({ id: id(4), kind: 'text', text: 'one\ntwo', fontSize: 20, boxWidth: 40, lineHeight: 1.5, textAlign: 'left', letterSpacing: 0, fontFamily: 'Arial', bold: false, color: '#fff' });
  const contained = planRevealAll({ w: 200, h: 200, layers: [shape, text] }, {});
  assert.equal(contained.changed, false);
  assert.deepEqual(layerLocalBounds(text, {}), { x: 0, y: 0, width: 120, height: 56 });
  assert.deepEqual(layerBounds(shape, {}), { x: 80, y: 10, width: 10, height: 20 });
  const outlined = { ...shape, fill: false };
  assert.deepEqual(layerBounds(outlined, {}), { x: 79.5, y: 9.5, width: 11, height: 21 });
});

test('Reveal All has conservative text overflow and measured browser bounds hooks', () => {
  const text = layer({ id: id(6), kind: 'text', text: 'wide', fontSize: 20, boxWidth: 10, lineHeight: 1.2, textAlign: 'center', letterSpacing: 4, fontFamily: 'Arial', bold: false, color: '#fff' });
  const estimated = layerLocalBounds(text, {});
  assert.ok(estimated.width > 10);
  const context = { font: '', save() {}, restore() {}, measureText(value) { return { width: value.length * 10, actualBoundingBoxAscent: 15, actualBoundingBoxDescent: 5 }; } };
  assert.deepEqual(measuredTextLayerBounds(context, text), { x: -21, y: 0, width: 52, height: 21 });
  const blurred = layer({ matrix: identity(), adjustments: { ...adjustments, blur: 10 } });
  assert.deepEqual(layerBounds(blurred, {}), { x: -30, y: -30, width: 70, height: 70 });
  const empty = layer({ id: id(7), kind: 'text', text: '', matrix: [1, 0, 0, 1, -500, -500], fontSize: 40, boxWidth: 100, lineHeight: 1.2, textAlign: 'left', letterSpacing: 0, fontFamily: 'Arial', bold: false, color: '#fff' });
  assert.equal(planRevealAll({ w: 100, h: 100, layers: [empty] }, {}).changed, false);
});

test('Reveal All enforces canvas limits and validates missing raster assets', () => {
  const tooLarge = raster({ matrix: [1, 0, 0, 1, 20000, 0] });
  assert.throws(() => planRevealAll({ w: 100, h: 100, layers: [tooLarge] }, assets), /16,000/);
  assert.throws(() => planRevealAll({ w: 100, h: 100, layers: [raster({ asset: 'missing' })] }, assets), /missing/);
  assert.throws(() => planRevealAll({ w: 100, h: 100, layers: [raster({ matrix: [0, 0, 0, 0, 0, 0] })] }, assets), /transform/);
});

test('Canvas operations preserve print metadata through explicit helper', () => {
  assert.deepEqual(canvasSizeImageMetadata({ imageSize: { resolution: 300, resolutionUnit: 'ppi' } }), { resolution: 300, resolutionUnit: 'ppi' });
  assert.deepEqual(canvasSizeImageMetadata({}), { resolution: 72, resolutionUnit: 'ppi' });
});
