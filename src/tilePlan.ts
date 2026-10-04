/**
 * Bounded tile planning shared by worker-backed image operations.
 *
 * Tiles describe an inner write rectangle and an optional expanded read
 * rectangle.  The read overlap is required by neighbourhood effects such as
 * blur, healing and unsharp masks; callers can discard the overlap when they
 * write the inner rectangle back to the destination.
 */

export const TILE_MIN_SIZE = 64;
export const TILE_MAX_SIZE = 1024;
export const DEFAULT_TILE_SIZE = 512;
/** Keep worker plans aligned with the existing image import safety envelope. */
export const TILE_MAX_DIMENSION = 16000;
export const TILE_MAX_PIXELS = 16_000_000;
/** A malformed request must not be able to create an unbounded tile list. */
export const TILE_MAX_COUNT = 4096;
/** Default expanded RGBA budget for one scheduled worker batch. */
export const DEFAULT_TILE_BATCH_BYTES = 16 * 1024 * 1024;
/** Keep a caller from opting into an unbounded temporary allocation. */
export const TILE_MAX_BATCH_BYTES = 64 * 1024 * 1024;

export type Tile = {
  x: number;
  y: number;
  width: number;
  height: number;
  readX: number;
  readY: number;
  readWidth: number;
  readHeight: number;
};

export type TilePlan = {
  width: number;
  height: number;
  tileSize: number;
  overlap: number;
  tiles: Tile[];
  /** Maximum temporary RGBA bytes needed for one expanded tile. */
  maxTileBytes: number;
};

export type TileBatch = {
  /** Stable zero-based row-major batch number. */
  index: number;
  /** Tiles are retained in the same order as the source plan. */
  tiles: Tile[];
  /** Sum of expanded read-buffer bytes in this batch. */
  bytes: number;
};

export type TileSchedule = {
  maxBatchBytes: number;
  batches: TileBatch[];
  tileCount: number;
};

const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

function assertDimensions(width: number, height: number): void {
  if (
    !integer(width) ||
    !integer(height) ||
    width < 1 ||
    height < 1 ||
    width > TILE_MAX_DIMENSION ||
    height > TILE_MAX_DIMENSION ||
    width * height > TILE_MAX_PIXELS
  )
    throw new RangeError(
      `Tile dimensions must be positive integers no larger than ${TILE_MAX_DIMENSION} px and ${TILE_MAX_PIXELS} pixels`,
    );
}

function assertTile(tile: Tile, width: number, height: number): void {
  if (
    !tile ||
    !integer(tile.x) ||
    !integer(tile.y) ||
    !integer(tile.width) ||
    !integer(tile.height) ||
    !integer(tile.readX) ||
    !integer(tile.readY) ||
    !integer(tile.readWidth) ||
    !integer(tile.readHeight) ||
    tile.x < 0 ||
    tile.y < 0 ||
    tile.width < 1 ||
    tile.height < 1 ||
    tile.readX < 0 ||
    tile.readY < 0 ||
    tile.readWidth < 1 ||
    tile.readHeight < 1 ||
    tile.x + tile.width > width ||
    tile.y + tile.height > height ||
    tile.readX + tile.readWidth > width ||
    tile.readY + tile.readHeight > height ||
    tile.x < tile.readX ||
    tile.y < tile.readY ||
    tile.x + tile.width > tile.readX + tile.readWidth ||
    tile.y + tile.height > tile.readY + tile.readHeight
  )
    throw new RangeError('Tile rectangle is outside the image or read bounds');
}

/** Return a deterministic row-major tile plan with bounded overlap. */
export function planTiles(
  width: number,
  height: number,
  options: { tileSize?: number; overlap?: number } = {},
): TilePlan {
  assertDimensions(width, height);
  const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
  const overlap = options.overlap ?? 0;
  if (
    !integer(tileSize) ||
    tileSize < TILE_MIN_SIZE ||
    tileSize > TILE_MAX_SIZE
  )
    throw new RangeError(
      `Tile size must be ${TILE_MIN_SIZE}-${TILE_MAX_SIZE} pixels`,
    );
  if (!integer(overlap) || overlap < 0 || overlap > Math.floor(tileSize / 2))
    throw new RangeError('Tile overlap must be a bounded non-negative integer');

  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const tileWidth = Math.min(tileSize, width - x);
      const tileHeight = Math.min(tileSize, height - y);
      const readX = Math.max(0, x - overlap);
      const readY = Math.max(0, y - overlap);
      const readRight = Math.min(width, x + tileWidth + overlap);
      const readBottom = Math.min(height, y + tileHeight + overlap);
      tiles.push({
        x,
        y,
        width: tileWidth,
        height: tileHeight,
        readX,
        readY,
        readWidth: readRight - readX,
        readHeight: readBottom - readY,
      });
    }
  }
  if (tiles.length > TILE_MAX_COUNT)
    throw new RangeError(`Tile plan exceeds the ${TILE_MAX_COUNT}-tile safety bound`);
  return {
    width,
    height,
    tileSize,
    overlap,
    tiles,
    maxTileBytes: tiles.reduce(
      (max, tile) =>
        Math.max(max, tile.readWidth * tile.readHeight * 4),
      0,
    ),
  };
}

function tileReadBytes(tile: Tile): number {
  return tile.readWidth * tile.readHeight * 4;
}

/**
 * Group an existing row-major plan into memory-bounded worker batches.
 *
 * A batch is a scheduling boundary, not a promise that tiles are rendered in
 * parallel. Callers may process each tile serially and release its expanded
 * read buffer before moving to the next one, or use the batch as the upper
 * bound for a small worker pool. Keeping this contract separate from
 * `planTiles` lets document rendering adopt it without changing the current
 * full-frame result protocol.
 */
export function scheduleTiles(
  plan: TilePlan,
  options: { maxBatchBytes?: number } = {},
): TileSchedule {
  if (
    !plan ||
    !integer(plan.width) ||
    !integer(plan.height) ||
    !Array.isArray(plan.tiles) ||
    plan.tiles.length < 1 ||
    plan.tiles.length > TILE_MAX_COUNT
  )
    throw new RangeError('Tile schedule requires a bounded non-empty tile plan');
  assertDimensions(plan.width, plan.height);
  const maxBatchBytes = options.maxBatchBytes ?? DEFAULT_TILE_BATCH_BYTES;
  if (
    !Number.isSafeInteger(maxBatchBytes) ||
    maxBatchBytes < 1 ||
    maxBatchBytes > TILE_MAX_BATCH_BYTES
  )
    throw new RangeError(
      `Tile batch bytes must be a positive integer no larger than ${TILE_MAX_BATCH_BYTES}`,
    );

  const batches: TileBatch[] = [];
  let tiles: Tile[] = [];
  let bytes = 0;
  for (const tile of plan.tiles) {
    assertTile(tile, plan.width, plan.height);
    const tileBytes = tileReadBytes(tile);
    if (tileBytes > maxBatchBytes)
      throw new RangeError('Tile exceeds the configured batch byte budget');
    if (tiles.length > 0 && bytes + tileBytes > maxBatchBytes) {
      batches.push({ index: batches.length, tiles, bytes });
      tiles = [];
      bytes = 0;
    }
    tiles.push(tile);
    bytes += tileBytes;
  }
  if (tiles.length > 0) batches.push({ index: batches.length, tiles, bytes });
  return { maxBatchBytes, batches, tileCount: plan.tiles.length };
}

/** Copy an expanded RGBA tile out of a tightly packed source buffer. */
export function readTile(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  tile: Tile,
): Uint8ClampedArray {
  assertDimensions(width, height);
  assertTile(tile, width, height);
  if (source.length !== width * height * 4)
    throw new RangeError('Tile source length does not match dimensions');
  const output = new Uint8ClampedArray(tile.readWidth * tile.readHeight * 4);
  for (let row = 0; row < tile.readHeight; row += 1) {
    const sourceOffset =
      ((tile.readY + row) * width + tile.readX) * 4;
    const outputOffset = row * tile.readWidth * 4;
    output.set(
      source.subarray(sourceOffset, sourceOffset + tile.readWidth * 4),
      outputOffset,
    );
  }
  return output;
}

/** Copy an inner tile back into a tightly packed RGBA destination buffer. */
export function writeTile(
  destination: Uint8ClampedArray,
  width: number,
  height: number,
  tile: Tile,
  pixels: Uint8ClampedArray,
  sourceWidth = tile.readWidth,
  sourceHeight = tile.readHeight,
): void {
  assertDimensions(width, height);
  assertTile(tile, width, height);
  if (
    !integer(sourceWidth) ||
    !integer(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    sourceWidth > TILE_MAX_DIMENSION ||
    sourceHeight > TILE_MAX_DIMENSION ||
    sourceWidth * sourceHeight > TILE_MAX_PIXELS
  )
    throw new RangeError('Tile source dimensions must be positive integers');
  if (destination.length !== width * height * 4)
    throw new RangeError('Tile destination length does not match dimensions');
  if (
    pixels.length !== sourceWidth * sourceHeight * 4 ||
    tile.x < tile.readX ||
    tile.y < tile.readY ||
    tile.x + tile.width > tile.readX + sourceWidth ||
    tile.y + tile.height > tile.readY + sourceHeight
  )
    throw new RangeError('Tile output does not contain the inner rectangle');
  const offsetX = tile.x - tile.readX;
  const offsetY = tile.y - tile.readY;
  for (let row = 0; row < tile.height; row += 1) {
    const sourceOffset =
      ((offsetY + row) * sourceWidth + offsetX) * 4;
    const destinationOffset = ((tile.y + row) * width + tile.x) * 4;
    destination.set(
      pixels.subarray(sourceOffset, sourceOffset + tile.width * 4),
      destinationOffset,
    );
  }
}

/** A tiny byte-bounded LRU cache for decoded or processed tiles. */
export class TileCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private usedBytes = 0;
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new RangeError('Tile cache size must be a positive byte count');
    this.maxBytes = maxBytes;
  }

  get bytes(): number {
    return this.usedBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number): boolean {
    if (!key || !Number.isSafeInteger(bytes) || bytes < 1) return false;
    if (bytes > this.maxBytes) return false;
    const previous = this.entries.get(key);
    if (previous) this.usedBytes -= previous.bytes;
    this.entries.delete(key);
    this.entries.set(key, { value, bytes });
    this.usedBytes += bytes;
    while (this.usedBytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.usedBytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.usedBytes = 0;
  }
}
