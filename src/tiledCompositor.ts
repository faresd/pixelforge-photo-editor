import {
  DEFAULT_TILE_BATCH_BYTES,
  TILE_MAX_BATCH_BYTES,
  planTiles,
  readTile,
  writeTile,
  type Tile,
  type TileBatch,
  type TilePlan,
  type TileSchedule,
} from './tilePlan.ts';
import {
  createTiledRenderPlan,
  type TiledRenderPlan,
  type TiledRenderRequest,
  type TiledRenderTileSize,
} from './tiledRender.ts';

/** A tightly packed RGBA frame used by the tile compositor. */
export type TiledPixels = Uint8ClampedArray;

export type TiledPixelRenderContext = {
  request: TiledRenderRequest;
  plan: TiledRenderPlan;
  batch: TileBatch;
  batchTileIndex: number;
  tileIndex: number;
  /** Dimensions of the expanded read buffer passed to the callback. */
  inputWidth: number;
  inputHeight: number;
};

/**
 * Render one expanded tile. The callback must return pixels with the same
 * expanded dimensions; the compositor copies only the tile's inner write
 * rectangle into the full-frame destination. This makes neighbourhood effects
 * deterministic at tile seams when the overlap is at least their read radius.
 */
export type TiledPixelRenderer = (
  pixels: TiledPixels,
  tile: Tile,
  context: TiledPixelRenderContext,
) => TiledPixels | Promise<TiledPixels>;

export type TiledPixelProgress = {
  id: number;
  completed: number;
  total: number;
  batchIndex: number;
  tile: Tile;
  /** Retained input/output tile bytes for the completed callback. */
  workingBytes: number;
  peakWorkingBytes: number;
};

export type TiledPixelCompositorOptions = {
  tileSize?: TiledRenderTileSize;
  overlap?: number;
  maxBatchBytes?: number;
  /** Upper bound for one expanded input plus its returned output. */
  maxWorkingBytes?: number;
  signal?: AbortSignal;
  onProgress?: (progress: TiledPixelProgress) => void;
};

export type TiledPixelCompositorResult = {
  pixels: TiledPixels;
  plan: TiledRenderPlan;
  schedule: TileSchedule;
  peakWorkingBytes: number;
};

export type TiledParityMismatch = {
  byteIndex: number;
  x: number;
  y: number;
  channel: number;
  expected: number;
  actual: number;
};

export type TiledParityResult = {
  match: boolean;
  comparedBytes: number;
  mismatchedBytes: number;
  maxDelta: number;
  firstMismatch?: TiledParityMismatch;
};

export type FullFramePixelRenderer = (
  pixels: TiledPixels,
  width: number,
  height: number,
) => TiledPixels | Promise<TiledPixels>;

export type TiledParityComparison = {
  fullFrame: TiledPixels;
  tiled: TiledPixelCompositorResult;
  parity: TiledParityResult;
};

const isPixels = (value: unknown): value is TiledPixels =>
  value instanceof Uint8ClampedArray;

function abortError(): Error {
  const error = new Error('Tiled pixel composition cancelled');
  error.name = 'AbortError';
  return error;
}

function assertAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function assertFramePixels(
  pixels: unknown,
  width: number,
  height: number,
  label: string,
): asserts pixels is TiledPixels {
  if (!isPixels(pixels) || pixels.length !== width * height * 4)
    throw new RangeError(
      `${label} must contain exactly ${width} × ${height} RGBA pixels`,
    );
}

function normalizeWorkingBudget(value: unknown): number {
  const budget = value === undefined ? DEFAULT_TILE_BATCH_BYTES : value;
  if (
    typeof budget !== 'number' ||
    !Number.isSafeInteger(budget) ||
    budget < 1 ||
    budget > TILE_MAX_BATCH_BYTES
  )
    throw new RangeError(
      `Tiled compositor working bytes must be a positive integer no larger than ${TILE_MAX_BATCH_BYTES}`,
    );
  return budget;
}

/**
 * Assemble a full RGBA frame from serial expanded-tile callbacks.
 *
 * Only one expanded input/output pair is retained at a time. The caller's
 * source is never mutated, and overlap pixels are discarded at the write
 * boundary so each destination pixel has exactly one owner.
 */
export async function composeTiledPixels(
  source: TiledPixels,
  width: number,
  height: number,
  renderTile: TiledPixelRenderer,
  id = 1,
  options: TiledPixelCompositorOptions = {},
): Promise<TiledPixelCompositorResult> {
  if (!isPixels(source))
    throw new TypeError('Tiled compositor source must be RGBA pixels');
  if (typeof renderTile !== 'function')
    throw new TypeError('A tiled pixel renderer callback is required');
  assertFramePixels(source, width, height, 'Tiled compositor source');
  const maxWorkingBytes = normalizeWorkingBudget(options.maxWorkingBytes);
  const plan = createTiledRenderPlan(id, width, height, options);
  const output = new Uint8ClampedArray(source.length);
  let completed = 0;
  let peakWorkingBytes = 0;

  for (const batch of plan.schedule.batches) {
    for (
      let batchTileIndex = 0;
      batchTileIndex < batch.tiles.length;
      batchTileIndex += 1
    ) {
      assertAbort(options.signal);
      const tile = batch.tiles[batchTileIndex];
      const inputBytes = tile.readWidth * tile.readHeight * 4;
      if (inputBytes > maxWorkingBytes)
        throw new RangeError(
          'Expanded tile exceeds the tiled compositor working-byte budget',
        );
      const input = readTile(source, width, height, tile);
      const context: TiledPixelRenderContext = {
        request: plan.request,
        plan,
        batch,
        batchTileIndex,
        tileIndex: completed,
        inputWidth: tile.readWidth,
        inputHeight: tile.readHeight,
      };
      const rendered = await renderTile(input, tile, context);
      assertAbort(options.signal);
      assertFramePixels(
        rendered,
        tile.readWidth,
        tile.readHeight,
        'Tiled renderer output',
      );
      const sharesBuffer = rendered.buffer === input.buffer;
      const workingBytes = sharesBuffer
        ? input.byteLength
        : input.byteLength + rendered.byteLength;
      if (workingBytes > maxWorkingBytes)
        throw new RangeError(
          'Expanded tile input/output exceeds the tiled compositor working-byte budget',
        );
      peakWorkingBytes = Math.max(peakWorkingBytes, workingBytes);
      writeTile(
        output,
        width,
        height,
        tile,
        rendered,
        tile.readWidth,
        tile.readHeight,
      );
      completed += 1;
      options.onProgress?.({
        id,
        completed,
        total: plan.schedule.tileCount,
        batchIndex: batch.index,
        tile,
        workingBytes,
        peakWorkingBytes,
      });
    }
  }

  return { pixels: output, plan, schedule: plan.schedule, peakWorkingBytes };
}

function comparePixels(
  expected: TiledPixels,
  actual: TiledPixels,
  width: number,
  height: number,
): TiledParityResult {
  const comparedBytes = expected.length;
  let mismatchedBytes = 0;
  let maxDelta = 0;
  let firstMismatch: TiledParityMismatch | undefined;
  for (let byteIndex = 0; byteIndex < comparedBytes; byteIndex += 1) {
    const expectedValue = expected[byteIndex];
    const actualValue = actual[byteIndex];
    const delta = Math.abs(expectedValue - actualValue);
    if (delta === 0) continue;
    mismatchedBytes += 1;
    maxDelta = Math.max(maxDelta, delta);
    if (!firstMismatch) {
      const pixel = Math.floor(byteIndex / 4);
      firstMismatch = {
        byteIndex,
        x: pixel % width,
        y: Math.floor(pixel / width),
        channel: byteIndex % 4,
        expected: expectedValue,
        actual: actualValue,
      };
    }
  }
  // Keep the dimensions in this helper's contract even though exact-length
  // validation happens before comparison; a changed call site cannot silently
  // compare buffers with a different frame shape.
  if (
    expected.length !== width * height * 4 ||
    actual.length !== expected.length
  )
    throw new RangeError(
      'Tiled parity buffers do not match the frame dimensions',
    );
  return {
    match: mismatchedBytes === 0,
    comparedBytes,
    mismatchedBytes,
    maxDelta,
    ...(firstMismatch ? { firstMismatch } : {}),
  };
}

/**
 * Render the same source through a full-frame oracle and the tiled compositor.
 * The exact byte comparison is intentionally separate from production render
 * selection so a future worker/tile adapter must prove parity before exposure.
 */
export async function compareTiledWithFullFrame(
  source: TiledPixels,
  width: number,
  height: number,
  fullFrame: FullFramePixelRenderer,
  renderTile: TiledPixelRenderer,
  id = 1,
  options: TiledPixelCompositorOptions = {},
): Promise<TiledParityComparison> {
  if (typeof fullFrame !== 'function')
    throw new TypeError('A full-frame parity renderer callback is required');
  assertFramePixels(source, width, height, 'Tiled parity source');
  const oracle = await fullFrame(Uint8ClampedArray.from(source), width, height);
  assertFramePixels(oracle, width, height, 'Full-frame parity output');
  const tiled = await composeTiledPixels(
    source,
    width,
    height,
    renderTile,
    id,
    options,
  );
  return {
    fullFrame: oracle,
    tiled,
    parity: comparePixels(oracle, tiled.pixels, width, height),
  };
}

// Keep plan-related types discoverable to TypeScript consumers without making
// callers import the lower-level planner just to describe a compositor result.
export type { Tile, TilePlan };
export { planTiles };
