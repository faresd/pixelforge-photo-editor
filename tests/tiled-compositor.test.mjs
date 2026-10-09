import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTiledWithFullFrame,
  composeTiledPixels,
} from '../src/tiledCompositor.ts';

function sourcePixels(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 17 + y * 3) % 256;
      pixels[offset + 1] = (x * 5 + y * 19) % 256;
      pixels[offset + 2] = (x * 11 + y * 7) % 256;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function blurFrame(source, width, height, radius = 2) {
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      let count = 0;
      const sums = [0, 0, 0, 0];
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sampleX = Math.max(0, Math.min(width - 1, x + dx));
          const sourceOffset = (sampleY * width + sampleX) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            sums[channel] += source[sourceOffset + channel];
          count += 1;
        }
      }
      for (let channel = 0; channel < 4; channel += 1)
        output[target + channel] = Math.round(sums[channel] / count);
    }
  }
  return output;
}

function blurExpandedTile(input, tile, radius = 2) {
  const output = new Uint8ClampedArray(input.length);
  for (let y = 0; y < tile.readHeight; y += 1) {
    for (let x = 0; x < tile.readWidth; x += 1) {
      const target = (y * tile.readWidth + x) * 4;
      let count = 0;
      const sums = [0, 0, 0, 0];
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sampleY = Math.max(0, Math.min(tile.readHeight - 1, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sampleX = Math.max(0, Math.min(tile.readWidth - 1, x + dx));
          const sourceOffset = (sampleY * tile.readWidth + sampleX) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            sums[channel] += input[sourceOffset + channel];
          count += 1;
        }
      }
      for (let channel = 0; channel < 4; channel += 1)
        output[target + channel] = Math.round(sums[channel] / count);
    }
  }
  return output;
}

test('overlap-aware compositor matches a full-frame neighbourhood oracle exactly', async () => {
  const width = 520;
  const height = 300;
  const source = sourcePixels(width, height);
  const before = Uint8ClampedArray.from(source);
  const result = await compareTiledWithFullFrame(
    source,
    width,
    height,
    (pixels, frameWidth, frameHeight) =>
      blurFrame(pixels, frameWidth, frameHeight),
    (pixels, tile) => blurExpandedTile(pixels, tile),
    31,
    { tileSize: 256, overlap: 2, maxWorkingBytes: 2 * 512 * 512 * 4 },
  );

  assert.equal(result.parity.match, true);
  assert.equal(result.parity.mismatchedBytes, 0);
  assert.equal(result.parity.maxDelta, 0);
  assert.deepEqual(source, before);
  assert.equal(result.tiled.plan.schedule.tileCount, 6);
  assert.ok(result.tiled.peakWorkingBytes <= 2 * 512 * 512 * 4);
});

test('parity oracle exposes a seam when overlap is smaller than the effect radius', async () => {
  const result = await compareTiledWithFullFrame(
    sourcePixels(520, 300),
    520,
    300,
    (pixels, width, height) => blurFrame(pixels, width, height),
    (pixels, tile) => blurExpandedTile(pixels, tile),
    32,
    { tileSize: 256, overlap: 0, maxWorkingBytes: 2 * 512 * 512 * 4 },
  );

  assert.equal(result.parity.match, false);
  assert.ok(result.parity.mismatchedBytes > 0);
  assert.ok(result.parity.firstMismatch);
  assert.ok(result.parity.maxDelta > 0);
});

test('compositor writes only inner rectangles and reports bounded progress', async () => {
  const progress = [];
  const width = 520;
  const height = 300;
  const result = await composeTiledPixels(
    sourcePixels(width, height),
    width,
    height,
    (pixels, tile) => {
      const output = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < tile.readHeight; y += 1) {
        for (let x = 0; x < tile.readWidth; x += 1) {
          const offset = (y * tile.readWidth + x) * 4;
          output[offset] = tile.x / 2;
          output[offset + 1] = tile.y / 2;
          output[offset + 2] = 77;
          output[offset + 3] = 255;
        }
      }
      return output;
    },
    33,
    {
      tileSize: 256,
      overlap: 8,
      maxWorkingBytes: 2 * 512 * 512 * 4,
      onProgress: (event) => progress.push(event),
    },
  );

  assert.equal(progress.length, 6);
  assert.deepEqual(
    progress.map((event) => event.completed),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(progress.every((event) => event.total === 6));
  assert.ok(progress.every((event) => event.workingBytes <= 2 * 512 * 512 * 4));
  assert.equal(result.pixels[255 * 4], 0);
  assert.equal(result.pixels[256 * 4], 128);
  assert.equal(result.pixels[(299 * width + 0) * 4 + 1], 128);
  assert.equal(result.pixels[(299 * width + 519) * 4 + 1], 128);
});

test('compositor rejects unsafe output shapes and preserves renderer errors', async () => {
  await assert.rejects(
    composeTiledPixels(
      sourcePixels(256, 256),
      256,
      256,
      () => new Uint8ClampedArray(4),
      34,
      { tileSize: 256, overlap: 0 },
    ),
    /exactly 256 × 256 RGBA pixels/,
  );
  await assert.rejects(
    composeTiledPixels(
      sourcePixels(256, 256),
      256,
      256,
      () => {
        throw new Error('renderer failed');
      },
      35,
      { tileSize: 256, overlap: 0 },
    ),
    /renderer failed/,
  );
});

test('compositor checks the working-byte bound before allocating a tile', async () => {
  let calls = 0;
  await assert.rejects(
    composeTiledPixels(
      sourcePixels(256, 256),
      256,
      256,
      () => {
        calls += 1;
        return new Uint8ClampedArray(256 * 256 * 4);
      },
      36,
      { tileSize: 256, maxWorkingBytes: 1024 },
    ),
    /Expanded tile exceeds/,
  );
  assert.equal(calls, 0);

  await assert.rejects(
    composeTiledPixels(
      sourcePixels(256, 256),
      256,
      256,
      (pixels) => {
        assert.equal(pixels.byteLength, 256 * 256 * 4);
        return new Uint8ClampedArray(pixels.length);
      },
      37,
      { tileSize: 256, maxWorkingBytes: 400_000 },
    ),
    /input\/output exceeds/,
  );
});

test('compositor cancellation is checked before work and after a callback', async () => {
  const before = new AbortController();
  before.abort();
  let calls = 0;
  await assert.rejects(
    composeTiledPixels(
      sourcePixels(520, 300),
      520,
      300,
      () => {
        calls += 1;
        return new Uint8ClampedArray(256 * 256 * 4);
      },
      38,
      { tileSize: 256, signal: before.signal },
    ),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(calls, 0);

  const during = new AbortController();
  await assert.rejects(
    composeTiledPixels(
      sourcePixels(520, 300),
      520,
      300,
      (pixels) => {
        during.abort();
        return pixels;
      },
      39,
      { tileSize: 256, signal: during.signal },
    ),
    (error) => error?.name === 'AbortError',
  );
});
