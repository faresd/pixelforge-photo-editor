import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TILE_SIZE,
  TILE_MAX_DIMENSION,
  TILE_MAX_COUNT,
  TILE_MAX_SIZE,
  TILE_MIN_SIZE,
  DEFAULT_TILE_BATCH_BYTES,
  TILE_MAX_BATCH_BYTES,
  scheduleTiles,
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

test('tile scheduling preserves row-major order under an expanded-byte budget', () => {
  const plan = planTiles(1300, 900, { tileSize: 512, overlap: 8 });
  const firstTileBytes = plan.tiles[0].readWidth * plan.tiles[0].readHeight * 4;
  const schedule = scheduleTiles(plan, { maxBatchBytes: firstTileBytes * 2 });
  assert.equal(schedule.tileCount, plan.tiles.length);
  assert.ok(schedule.batches.length > 1);
  assert.ok(schedule.batches.every((batch) => batch.bytes <= firstTileBytes * 2));
  assert.deepEqual(schedule.batches.flatMap((batch) => batch.tiles), plan.tiles);
  assert.deepEqual(schedule.batches.map((batch) => batch.index), schedule.batches.map((_, index) => index));
});

test('tile scheduling rejects forged plans and unsafe byte budgets', () => {
  const plan = planTiles(1300, 900, { tileSize: 512, overlap: 8 });
  assert.equal(DEFAULT_TILE_BATCH_BYTES, 16 * 1024 * 1024);
  assert.equal(TILE_MAX_BATCH_BYTES, 64 * 1024 * 1024);
  assert.throws(() => scheduleTiles({ ...plan, tiles: [] }), /non-empty/);
  assert.throws(() => scheduleTiles(plan, { maxBatchBytes: 0 }), /positive integer/);
  assert.throws(() => scheduleTiles(plan, { maxBatchBytes: TILE_MAX_BATCH_BYTES + 1 }), /no larger/);
  const forged = { ...plan, tiles: [{ ...plan.tiles[0], readWidth: 1400 }] };
  assert.throws(() => scheduleTiles(forged), /outside the image/);
  assert.throws(() => scheduleTiles(plan, { maxBatchBytes: 1 }), /exceeds the configured batch byte budget/);
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
  assert.deepEqual(cache.stats, {
    bytes: 10,
    size: 2,
    maxBytes: 10,
    peakBytes: 14,
    hits: 2,
    misses: 1,
    evictions: 1,
    evictedBytes: 4,
    rejected: 1,
  });
  assert.equal(cache.delete('a'), true);
  assert.equal(cache.delete('a'), false);
  assert.equal(cache.bytes, 4);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});
