import {
  DEFAULT_TILE_BATCH_BYTES,
  DEFAULT_TILE_SIZE,
  TILE_MAX_BATCH_BYTES,
  TILE_MAX_DIMENSION,
  TILE_MAX_PIXELS,
  TILE_MAX_SIZE,
  TILE_MIN_SIZE,
  planTiles,
  scheduleTiles,
  type Tile,
  type TileBatch,
  type TilePlan,
  type TileSchedule,
  TileCache,
} from './tilePlan.ts';

/**
 * Versioned envelope for the first document-tile scheduling slice.
 *
 * This is intentionally a planning protocol. It carries no pixel data and
 * does not opt the document renderer into tiled output yet.
 */
export const TILED_RENDER_PROTOCOL_VERSION = 1 as const;
export const TILED_RENDER_TILE_SIZES = [256, 512] as const;
export type TiledRenderTileSize = (typeof TILED_RENDER_TILE_SIZES)[number];

export type TiledRenderRequest = {
  kind: 'render-tiles';
  version: typeof TILED_RENDER_PROTOCOL_VERSION;
  id: number;
  width: number;
  height: number;
  tileSize: TiledRenderTileSize;
  overlap: number;
  maxBatchBytes: number;
};

export type TiledRenderPlan = {
  request: TiledRenderRequest;
  plan: TilePlan;
  schedule: TileSchedule;
};

export type TiledRenderProgress = {
  id: number;
  completed: number;
  total: number;
  batchIndex: number;
  tile: Tile;
};

export type TiledRenderRunOptions<T = unknown> = {
  tileSize?: TiledRenderTileSize;
  overlap?: number;
  maxBatchBytes?: number;
  signal?: AbortSignal;
  onProgress?: (progress: TiledRenderProgress) => void;
  /** Optional byte-bounded cache for repeatable tile work. */
  cache?: TileCache<T>;
  /** Override the deterministic key when a caller has a wider cache scope. */
  cacheKey?: (tile: Tile, context: TiledRenderTileContext) => string;
  /** Return the retained size of a rendered tile; non-positive values skip caching. */
  cacheBytes?: (value: T, tile: Tile, context: TiledRenderTileContext) => number;
};

export type TiledRenderTileContext = {
  request: TiledRenderRequest;
  plan: TiledRenderPlan;
  batch: TileBatch;
  batchTileIndex: number;
  tileIndex: number;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function abortError(): Error {
  const error = new Error('Tiled render cancelled');
  error.name = 'AbortError';
  return error;
}

function assertAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function defaultTileCacheKey(request: TiledRenderRequest, tileIndex: number, tile: Tile): string {
  return [
    request.width,
    request.height,
    request.tileSize,
    request.overlap,
    tileIndex,
    tile.x,
    tile.y,
    tile.width,
    tile.height,
    tile.readX,
    tile.readY,
    tile.readWidth,
    tile.readHeight,
  ].join(':');
}

function inferCacheBytes(value: unknown): number | undefined {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (record(value)) {
    if (typeof value.byteLength === 'number') return value.byteLength;
    if (typeof value.size === 'number') return value.size;
  }
  return undefined;
}

/** Return the only tile sizes supported by the first document-tile slice. */
export function normalizeTiledRenderTileSize(
  value: unknown = DEFAULT_TILE_SIZE,
): TiledRenderTileSize {
  if (value === 256 || value === 512) return value;
  throw new RangeError('Tiled render tile size must be 256 or 512 pixels');
}

function buildRequest(
  id: number,
  width: number,
  height: number,
  options: Pick<TiledRenderRunOptions, 'tileSize' | 'overlap' | 'maxBatchBytes'> = {},
): TiledRenderRequest {
  if (!positiveInteger(id)) throw new RangeError('Tiled render id must be positive');
  const tileSize = normalizeTiledRenderTileSize(options.tileSize);
  const overlap = options.overlap ?? 0;
  const maxBatchBytes = options.maxBatchBytes ?? DEFAULT_TILE_BATCH_BYTES;
  if (!Number.isSafeInteger(overlap) || overlap < 0 || overlap > Math.floor(tileSize / 2))
    throw new RangeError('Tiled render overlap must be a bounded non-negative integer');
  if (!Number.isSafeInteger(maxBatchBytes) || maxBatchBytes < 1 || maxBatchBytes > TILE_MAX_BATCH_BYTES)
    throw new RangeError(`Tiled render batch bytes must be a positive integer no larger than ${TILE_MAX_BATCH_BYTES}`);
  // planTiles performs the shared dimension and tile-count safety checks.
  planTiles(width, height, { tileSize, overlap });
  return {
    kind: 'render-tiles',
    version: TILED_RENDER_PROTOCOL_VERSION,
    id,
    width,
    height,
    tileSize,
    overlap,
    maxBatchBytes,
  };
}

/** Build a validated, serialisable render request and its deterministic plan. */
export function createTiledRenderPlan(
  id: number,
  width: number,
  height: number,
  options: Pick<TiledRenderRunOptions, 'tileSize' | 'overlap' | 'maxBatchBytes'> = {},
): TiledRenderPlan {
  const request = buildRequest(id, width, height, options);
  const plan = planTiles(width, height, {
    tileSize: request.tileSize,
    overlap: request.overlap,
  });
  const schedule = scheduleTiles(plan, { maxBatchBytes: request.maxBatchBytes });
  return { request, plan, schedule };
}

/**
 * Validate a request received across a worker boundary.
 *
 * No caller-supplied tile rectangle is trusted. The canonical plan is rebuilt
 * from dimensions and options so a forged payload cannot schedule out-of-bounds
 * reads or bypass the shared memory limits.
 */
export function validateTiledRenderRequest(value: unknown): TiledRenderRequest {
  if (!record(value)) throw new RangeError('Invalid tiled render request');
  const { id, width, height } = value;
  if (
    value.kind !== 'render-tiles' ||
    value.version !== TILED_RENDER_PROTOCOL_VERSION ||
    !positiveInteger(id) ||
    !positiveInteger(width) ||
    !positiveInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > TILE_MAX_DIMENSION ||
    height > TILE_MAX_DIMENSION ||
    width * height > TILE_MAX_PIXELS
  )
    throw new RangeError('Invalid tiled render request');
  const request = buildRequest(id, width, height, {
    tileSize: value.tileSize as TiledRenderTileSize | undefined,
    overlap: value.overlap as number | undefined,
    maxBatchBytes: value.maxBatchBytes as number | undefined,
  });
  return request;
}

/**
 * Run a deterministic row-major tile callback without changing document
 * rendering. A callback may be synchronous or asynchronous; cancellation is
 * checked before every tile and progress is emitted only after completion.
 */
export async function runTiledRender<T>(
  id: number,
  width: number,
  height: number,
  renderTile: (tile: Tile, context: TiledRenderTileContext) => T | Promise<T>,
  options: TiledRenderRunOptions<T> = {},
): Promise<{ plan: TiledRenderPlan; outputs: T[] }> {
  if (typeof renderTile !== 'function') throw new TypeError('A tile renderer callback is required');
  const tiledPlan = createTiledRenderPlan(id, width, height, options);
  const outputs: T[] = [];
  let completed = 0;
  for (const batch of tiledPlan.schedule.batches) {
    for (let batchTileIndex = 0; batchTileIndex < batch.tiles.length; batchTileIndex += 1) {
      assertAbort(options.signal);
      const tile = batch.tiles[batchTileIndex];
      const tileIndex = outputs.length;
      const context: TiledRenderTileContext = {
        request: tiledPlan.request,
        plan: tiledPlan,
        batch,
        batchTileIndex,
        tileIndex,
      };
      const cacheKey = options.cache
        ? options.cacheKey?.(tile, context) ??
          defaultTileCacheKey(tiledPlan.request, tileIndex, tile)
        : undefined;
      const cached = cacheKey ? options.cache?.get(cacheKey) : undefined;
      const output = cached === undefined ? await renderTile(tile, context) : cached;
      if (cached === undefined && cacheKey && options.cache) {
        const bytes = options.cacheBytes?.(output, tile, context) ?? inferCacheBytes(output);
        if (bytes !== undefined && Number.isSafeInteger(bytes) && bytes > 0)
          options.cache.set(cacheKey, output, bytes);
      }
      outputs.push(output);
      completed += 1;
      options.onProgress?.({
        id,
        completed,
        total: tiledPlan.schedule.tileCount,
        batchIndex: batch.index,
        tile,
      });
    }
  }
  return { plan: tiledPlan, outputs };
}

// Keep these imports visible to TypeScript consumers that use the module as a
// contract boundary while retaining the existing tilePlan implementation.
export { TILE_MAX_SIZE, TILE_MIN_SIZE };
