import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TILE_SIZE,
  TILE_MAX_DIMENSION,
  TILE_MAX_PIXELS,
  TILE_MAX_COUNT,
  TILE_MAX_SIZE,
  TILE_MIN_SIZE,
  TileCache,
  planTiles,
  readTile,
  writeTile,
} from '../src/tilePlan.ts';

test('tile planning covers the image exactly and bounds overlap reads', () => {
  const plan = planTiles(1300, 900, { tileSize: 512, overlap: 8 });
  assert.equal(plan.tiles.length, 6);
  assert.equal(plan.tiles[0].x, 0);
  assert.equal(plan.tiles[0].y, 0);
  assert.equal(plan.tiles[0].readX, 0);
  assert.equal(plan.tiles[0].readY, 0);
  const coverage = new Uint8Array(plan.width * plan.height);
  for (const tile of plan.tiles) {
    assert.ok(tile.readX <= tile.x);
    assert.ok(tile.readY <= tile.y);
    assert.ok(tile.readX + tile.readWidth >= tile.x + tile.width);
    assert.ok(tile.readY + tile.readHeight >= tile.y + tile.height);
    for (let y = tile.y; y < tile.y + tile.height; y += 1)
      for (let x = tile.x; x < tile.x + tile.width; x += 1)
        coverage[y * plan.width + x] += 1;
  }
  assert.ok(coverage.every((value) => value === 1));
  assert.ok(plan.maxTileBytes <= 528 * 528 * 4);
});

test('tile extraction and inner writes preserve row-major pixels', () => {
  const width = 5;
  const height = 4;
  const source = new Uint8ClampedArray(width * height * 4);
  source.forEach((_, index) => { source[index] = index % 251; });
  const tile = planTiles(width, height, { tileSize: 64, overlap: 1 }).tiles.at(-1);
  assert.ok(tile);
  const extracted = readTile(source, width, height, tile);
  const destination = new Uint8ClampedArray(source.length);
  writeTile(destination, width, height, tile, extracted);
  for (let y = tile.y; y < tile.y + tile.height; y += 1) {
    for (let x = tile.x; x < tile.x + tile.width; x += 1) {
      const offset = (y * width + x) * 4;
      assert.deepEqual(
        Array.from(destination.subarray(offset, offset + 4)),
        Array.from(source.subarray(offset, offset + 4)),
      );
    }
  }
  assert.equal(destination[0], 0);
});

test('tile bounds reject unsafe plans', () => {
  assert.throws(() => planTiles(0, 1), /positive integers/);
  assert.throws(() => planTiles(TILE_MAX_DIMENSION + 1, 1), /no larger/);
  assert.throws(() => planTiles(5000, 5000), /no larger/);
  assert.doesNotThrow(() => planTiles(16000, 1000, { tileSize: TILE_MIN_SIZE }));
  assert.throws(() => planTiles(1, 1, { tileSize: TILE_MIN_SIZE - 1 }), /Tile size/);
  assert.throws(() => planTiles(1, 1, { tileSize: TILE_MAX_SIZE + 1 }), /Tile size/);
  assert.throws(() => planTiles(1, 1, { tileSize: DEFAULT_TILE_SIZE, overlap: 257 }), /overlap/);
  assert.equal(TILE_MAX_COUNT, 4096);
});

test('tile reads and writes reject forged rectangles', () => {
  const source = new Uint8ClampedArray(4 * 4 * 4);
  const forged = { x: 3, y: 3, width: 2, height: 1, readX: 3, readY: 3, readWidth: 2, readHeight: 1 };
  assert.throws(() => readTile(source, 4, 4, forged), /outside the image/);
  assert.throws(() => writeTile(new Uint8ClampedArray(source.length), 4, 4, forged, new Uint8ClampedArray(8)), /outside the image/);
  const valid = planTiles(4, 4, { tileSize: 64 }).tiles[0];
  assert.throws(() => writeTile(new Uint8ClampedArray(source.length), 4, 4, valid, new Uint8ClampedArray(4), 0, 1), /source dimensions/);
});

test('byte-bounded LRU tile cache evicts oldest entries and can reset', () => {
  const cache = new TileCache(10);
  assert.equal(cache.set('a', 'A', 6), true);
  assert.equal(cache.set('b', 'B', 4), true);
  assert.equal(cache.bytes, 10);
  assert.equal(cache.get('a'), 'A');
  assert.equal(cache.set('c', 'C', 4), true);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'A');
  assert.equal(cache.bytes, 10);
  assert.equal(cache.set('too-large', 'x', 11), false);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});
