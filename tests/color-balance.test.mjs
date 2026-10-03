import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyColorBalancePixels,
  colorBalancePixel,
  effectiveColorBalance,
  isNeutralColorBalance,
  neutralColorBalance,
  validColorBalance,
} from '../src/colorBalance.ts';

test('color balance keeps neutral settings byte-identical', () => {
  const pixels = new Uint8ClampedArray([
    12, 32, 64, 255,
    180, 120, 40, 128,
    7, 9, 11, 0,
  ]);
  const before = Array.from(pixels);
  applyColorBalancePixels(pixels, neutralColorBalance);
  assert.deepEqual(Array.from(pixels), before);
  assert.equal(isNeutralColorBalance(undefined), true);
  assert.deepEqual(effectiveColorBalance(undefined), neutralColorBalance);
});

test('signed channels target the requested tonal range and preserve alpha', () => {
  const shadows = colorBalancePixel(24, 24, 24, {
    shadowsCyanRed: 100,
    shadowsMagentaGreen: 0,
    shadowsYellowBlue: 0,
    preserveLuminosity: false,
  });
  const highlights = colorBalancePixel(236, 236, 236, {
    highlightsCyanRed: -100,
    highlightsMagentaGreen: 0,
    highlightsYellowBlue: 0,
    preserveLuminosity: false,
  });
  assert.ok(shadows[0] > 24, `red channel should increase: ${JSON.stringify(shadows)}`);
  assert.ok(highlights[0] < 236, `red channel should decrease: ${JSON.stringify(highlights)}`);
  const pixels = new Uint8ClampedArray([24, 24, 24, 255, 236, 236, 236, 64, 7, 9, 11, 0]);
  applyColorBalancePixels(pixels, { midtonesCyanRed: 50, preserveLuminosity: false });
  assert.equal(pixels[3], 255);
  assert.equal(pixels[7], 64);
  assert.deepEqual(Array.from(pixels.slice(8)), [7, 9, 11, 0]);
});

test('preserve luminosity keeps weighted luminance close while changing chroma', () => {
  const settings = {
    midtonesCyanRed: 70,
    midtonesMagentaGreen: -40,
    midtonesYellowBlue: 30,
    preserveLuminosity: true,
  };
  const input = [110, 126, 142];
  const output = colorBalancePixel(...input, settings);
  const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  assert.notDeepEqual(output, input);
  assert.ok(Math.abs(luminance(output) - luminance(input)) < 2.5);
  assert.ok(output.every((value) => value >= 0 && value <= 255));
});

test('validation rejects malformed or out-of-range persisted settings', () => {
  const valid = effectiveColorBalance({ highlightsYellowBlue: -100 });
  assert.equal(validColorBalance(valid), true);
  assert.equal(validColorBalance({ ...valid, shadowsCyanRed: 101 }), false);
  assert.equal(validColorBalance({ ...valid, preserveLuminosity: 'yes' }), false);
  assert.equal(validColorBalance({ ...valid, midtonesMagentaGreen: Number.NaN }), false);
  assert.equal(validColorBalance(undefined), false);
});
