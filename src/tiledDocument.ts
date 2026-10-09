import {
  DEFAULT_TILE_BATCH_BYTES,
  TILE_MAX_BATCH_BYTES,
  type Tile,
  type TileSchedule,
  TileCache,
} from './tilePlan.ts';
import {
  createTiledRenderPlan,
  type TiledRenderPlan,
  type TiledRenderTileSize,
} from './tiledRender.ts';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';

/** Effects whose samples are bounded by a radius in source pixels. */
export function isTiledNeighborhoodBlur(
  value: Partial<FilterEffects> | undefined,
): boolean {
  if (
    value &&
    value.radius !== undefined &&
    (typeof value.radius !== 'number' ||
      !Number.isInteger(value.radius) ||
      value.radius < 1 ||
      value.radius > 64)
  )
    return false;
  const effect = effectiveFilterEffects(value);
  return (
    (effect.type === 'box-blur' || effect.type === 'gaussian-blur') &&
    effect.amount > 0 &&
    effect.radius > 0 &&
    effect.radius <= 64
  );
}

export type TiledMemoryLedger = {
  /** Full destination surface bytes retained by the caller. */
  destinationBytes: number;
  /** Largest input/output/sink tile working set observed. */
  peakWorkingBytes: number;
  /** Current byte count retained by the tile cache. */
  cacheBytes: number;
  /** Sum of known bytes at the highest point in the run. */
  peakBytes: number;
  maxWorkingBytes: number;
  maxCacheBytes: number;
};

export type TiledDocumentOptions = {
  tileSize?: TiledRenderTileSize;
  maxBatchBytes?: number;
  /** The editor revision is part of every cache key. */
  revision: string | number;
  cache?: TileCache<Uint8ClampedArray>;
  maxWorkingBytes?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
};

export type TiledDocumentResult = {
  plan: TiledRenderPlan;
  schedule: TileSchedule;
  ledger: TiledMemoryLedger;
};

export type TileSourceProvider = (
  tile: Tile,
  context: { plan: TiledRenderPlan; tileIndex: number },
) => Uint8ClampedArray | Promise<Uint8ClampedArray>;

export type TileDestinationSink = (
  pixels: Uint8ClampedArray,
  tile: Tile,
  context: { plan: TiledRenderPlan; tileIndex: number },
) => void | Promise<void>;

const abortError = (): Error => {
  const error = new Error('Tiled document render cancelled');
  error.name = 'AbortError';
  return error;
};

function assertAbort(signal: AbortSignal | undefined, isCancelled?: () => boolean): void {
  if (signal?.aborted || isCancelled?.()) throw abortError();
}

function assertPixels(
  pixels: unknown,
  width: number,
  height: number,
  label: string,
): asserts pixels is Uint8ClampedArray {
  if (
    !(pixels instanceof Uint8ClampedArray) ||
    pixels.length !== width * height * 4
  )
    throw new RangeError(
      `${label} must contain exactly ${width} × ${height} RGBA pixels`,
    );
}

function validateBudget(value: number | undefined, fallback: number): number {
  const budget = value ?? fallback;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > TILE_MAX_BATCH_BYTES)
    throw new RangeError(
      `Tiled document budget must be a positive integer no larger than ${TILE_MAX_BATCH_BYTES}`,
    );
  return budget;
}

function keyFor(
  revision: string | number,
  effect: FilterEffects,
  tile: Tile,
): string {
  return [
    revision,
    effect.type,
    effect.amount,
    effect.radius,
    effect.angle,
    effect.centerX,
    effect.centerY,
    effect.seed,
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

/**
 * Render an effect through a source provider and a destination sink.
 *
 * The provider owns source decoding and may read directly from an image or a
 * small tile canvas; this function never creates a full-frame source buffer.
 * The sink owns destination storage and receives only inner write rectangles.
 */
export async function renderTiledNeighborhoodEffect(
  width: number,
  height: number,
  effectValue: Partial<FilterEffects> | undefined,
  source: TileSourceProvider,
  sink: TileDestinationSink,
  options: TiledDocumentOptions,
): Promise<TiledDocumentResult> {
  const effect = effectiveFilterEffects(effectValue);
  if (!isTiledNeighborhoodBlur(effect))
    throw new RangeError('Effect is not a supported tiled neighbourhood blur');
  const maxWorkingBytes = validateBudget(options.maxWorkingBytes, DEFAULT_TILE_BATCH_BYTES);
  const maxBatchBytes = validateBudget(options.maxBatchBytes, DEFAULT_TILE_BATCH_BYTES);
  const plan = createTiledRenderPlan(1, width, height, {
    tileSize: options.tileSize,
    overlap: effect.radius,
    maxBatchBytes,
  });
  const destinationBytes = width * height * 4;
  const cache = options.cache;
  if (cache && cache.maxBytes > TILE_MAX_BATCH_BYTES)
    throw new RangeError('Tiled document cache exceeds the hard byte ceiling');
  const ledger: TiledMemoryLedger = {
    destinationBytes,
    peakWorkingBytes: 0,
    cacheBytes: cache?.bytes ?? 0,
    peakBytes: destinationBytes + (cache?.bytes ?? 0),
    maxWorkingBytes,
    maxCacheBytes: cache?.maxBytes ?? 0,
  };
  let completed = 0;
  for (const batch of plan.schedule.batches) {
    for (let batchTileIndex = 0; batchTileIndex < batch.tiles.length; batchTileIndex += 1) {
      assertAbort(options.signal, options.isCancelled);
      const tile = batch.tiles[batchTileIndex];
      const context = { plan, tileIndex: completed };
      const cacheKey = cache ? keyFor(options.revision, effect, tile) : undefined;
      let rendered: Uint8ClampedArray | undefined;
      const inputBytes = tile.readWidth * tile.readHeight * 4;
      const sinkBytes = tile.width * tile.height * 4;
      if (cacheKey && cache) {
        const cached = cache.get(cacheKey);
        if (cached) rendered = Uint8ClampedArray.from(cached);
      }
      if (!rendered) {
        const input = await source(tile, context);
        assertAbort(options.signal, options.isCancelled);
        assertPixels(input, tile.readWidth, tile.readHeight, 'Tiled source');
        const actualInputBytes = input.byteLength;
        if (actualInputBytes > maxWorkingBytes)
          throw new RangeError('Tiled source exceeds the working-byte budget');
        rendered = applyFilterEffectsPixels(
          input,
          tile.readWidth,
          tile.readHeight,
          effect,
        );
        assertAbort(options.signal, options.isCancelled);
        assertPixels(rendered, tile.readWidth, tile.readHeight, 'Tiled effect output');
        const workingBytes = actualInputBytes + rendered.byteLength + sinkBytes;
        if (workingBytes > maxWorkingBytes)
          throw new RangeError('Tiled effect input/output exceeds the working-byte budget');
        ledger.peakWorkingBytes = Math.max(ledger.peakWorkingBytes, workingBytes);
        if (cacheKey && cache) cache.set(cacheKey, Uint8ClampedArray.from(rendered), rendered.byteLength);
      }
      const workingBytes = inputBytes + rendered.byteLength + sinkBytes;
      if (workingBytes > maxWorkingBytes)
        throw new RangeError('Tiled effect input/output exceeds the working-byte budget');
      ledger.peakWorkingBytes = Math.max(ledger.peakWorkingBytes, workingBytes);
      assertAbort(options.signal, options.isCancelled);
      await sink(rendered, tile, context);
      assertAbort(options.signal, options.isCancelled);
      ledger.cacheBytes = cache?.bytes ?? 0;
      ledger.peakBytes = Math.max(
        ledger.peakBytes,
        destinationBytes + ledger.peakWorkingBytes + ledger.cacheBytes,
      );
      completed += 1;
      options.onProgress?.(completed, plan.schedule.tileCount);
    }
  }
  return { plan, schedule: plan.schedule, ledger };
}

/** Run the production-safe canvas adapter for a local blur. */
export async function applyTiledNeighborhoodBlur(
  source: CanvasImageSource,
  width: number,
  height: number,
  effectValue: Partial<FilterEffects> | undefined,
  options: TiledDocumentOptions,
): Promise<{ canvas: HTMLCanvasElement; result: TiledDocumentResult }> {
  if (!isTiledNeighborhoodBlur(effectValue))
    throw new RangeError('Effect is not a supported tiled neighbourhood blur');
  const destination =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(width, height);
  destination.width = width;
  destination.height = height;
  const destinationContext = destination.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!destinationContext) throw new Error('Tiled destination context unavailable');
  destinationContext.drawImage(source, 0, 0, width, height);
  let tileCanvas: HTMLCanvasElement | OffscreenCanvas | undefined;
  let tileContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  const sourceProvider: TileSourceProvider = (tile) => {
    tileCanvas = tileCanvas ??
      (typeof document !== 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(tile.readWidth, tile.readHeight));
    tileCanvas.width = tile.readWidth;
    tileCanvas.height = tile.readHeight;
    tileContext = tileCanvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!tileContext) throw new Error('Tiled source context unavailable');
    tileContext.clearRect(0, 0, tile.readWidth, tile.readHeight);
    tileContext.drawImage(
      source,
      tile.readX,
      tile.readY,
      tile.readWidth,
      tile.readHeight,
      0,
      0,
      tile.readWidth,
      tile.readHeight,
    );
    return tileContext.getImageData(0, 0, tile.readWidth, tile.readHeight).data;
  };
  const sink: TileDestinationSink = (pixels, tile) => {
    const inner = destinationContext.createImageData(tile.width, tile.height);
    for (let row = 0; row < tile.height; row += 1) {
      const sourceOffset =
        ((tile.y - tile.readY + row) * tile.readWidth + (tile.x - tile.readX)) * 4;
      inner.data.set(
        pixels.subarray(sourceOffset, sourceOffset + tile.width * 4),
        row * tile.width * 4,
      );
    }
    destinationContext.putImageData(inner, tile.x, tile.y);
  };
  const result = await renderTiledNeighborhoodEffect(
    width,
    height,
    effectValue,
    sourceProvider,
    sink,
    options,
  );
  return { canvas: destination as unknown as HTMLCanvasElement, result };
}
