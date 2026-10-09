import {
  referencedAssets,
  renderFrame,
  validateFrame,
  type Assets,
  type Frame,
} from './document.ts';
import type { TileCache } from './tilePlan.ts';
import {
  validTiledRenderTelemetry,
  type TiledRenderTelemetry,
} from './tiledDocument.ts';

export type WorkerRenderOptions = {
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  /** Report completed layer passes for visible large-render progress. */
  onProgress?: (completed: number, total: number) => void;
  /** Test/diagnostic override; normal editing selects workers for larger frames. */
  forceWorker?: boolean;
  /** Reuse one worker between sequential committed renders when true. */
  reuseWorker?: boolean;
  /** Revision/effect cache scope for the visible tiled blur adapter. */
  tiledRevision?: string | number;
  tiledCache?: TileCache<Uint8ClampedArray>;
  tiledMaxWorkingBytes?: number;
  /** Privacy-safe diagnostics for the latest eligible tiled effect. */
  onTiledTelemetry?: (telemetry: TiledRenderTelemetry) => void;
};

const RENDER_TIMEOUT_MS = 30_000;
const WORKER_MIN_PIXELS = 2_000_000;
let requestId = 0;

function abortError(): Error {
  if (typeof DOMException === 'function')
    return new DOMException('Document rendering cancelled', 'AbortError');
  const error = new Error('Document rendering cancelled');
  error.name = 'AbortError';
  return error;
}

/** Whether this browser can run the bounded OffscreenCanvas document renderer. */
export function canRenderInWorker(): boolean {
  if (
    typeof Worker !== 'function' ||
    typeof OffscreenCanvas !== 'function' ||
    typeof createImageBitmap !== 'function'
  ) {
    return false;
  }
  try {
    const probe = new OffscreenCanvas(1, 1);
    return (
      Boolean(probe.getContext('2d')) &&
      (typeof probe.transferToImageBitmap === 'function' ||
        typeof probe.convertToBlob === 'function')
    );
  } catch {
    return false;
  }
}

/**
 * Render an immutable frame in an isolated worker. Main-thread overrides are
 * intentionally kept on the synchronous path because they are live Canvas
 * surfaces from an in-progress brush gesture and cannot be structured-cloned.
 */
export async function renderFrameWithWorker(
  frame: Frame,
  assets: Assets,
  overrides?: Record<string, HTMLCanvasElement>,
  options: WorkerRenderOptions = {},
): Promise<CanvasImageSource> {
  const isCancelled = () => Boolean(options.signal?.aborted || options.isCancelled?.());
  if (isCancelled()) throw abortError();
  const fallback = async () => {
    const image = await renderFrame(frame, assets, overrides, {
      signal: options.signal,
      isCancelled,
      onProgress: options.onProgress,
      yieldEveryLayers: 1,
      tiledRevision: options.tiledRevision,
      tiledCache: options.tiledCache,
      tiledMaxWorkingBytes: options.tiledMaxWorkingBytes,
      onTiledTelemetry: options.onTiledTelemetry,
    });
    if (isCancelled()) throw abortError();
    return image;
  };
  const globalScope = globalThis as typeof globalThis & {
    __PIXELFORGE_FORCE_WORKER__?: boolean;
  };
  const useWorker =
    options.forceWorker === true ||
    globalScope.__PIXELFORGE_FORCE_WORKER__ === true ||
    frame.w * frame.h >= WORKER_MIN_PIXELS;
  if (overrides || !useWorker || !canRenderInWorker()) return fallback();
  validateFrame(frame, assets);
  if (options.signal?.aborted) throw abortError();
  if (options.reuseWorker)
    return persistentWorkerRender(frame, assets, options, fallback);

  let worker: Worker;
  try {
    worker = new Worker(
      new URL('./document-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch {
    return fallback();
  }
  const id = ++requestId;
  return new Promise<CanvasImageSource>((resolve, reject) => {
    let settled = false;
    let lastCompleted = 0;
    const timeout = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              'Worker rendering timed out. Try a smaller image or fewer layers.',
            ),
          ),
        ),
      RENDER_TIMEOUT_MS,
    );
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try {
        worker.terminate();
      } catch {
        /* Already unavailable. */
      }
      callback();
    };
    const cancel = () => {
      try {
        worker.postMessage({ kind: 'cancel', id });
      } catch {
        /* Worker already stopped. */
      }
      finish(() => reject(abortError()));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      const value = message as Record<string, unknown>;
      const closeResult = () => {
        if (value.kind === 'result' && value.image &&
            typeof (value.image as ImageBitmap).close === 'function')
          (value.image as ImageBitmap).close();
      };
      if (value.id !== id || settled) {
        closeResult();
        return;
      }
      if (isCancelled()) {
        closeResult();
        cancel();
        return;
      }
      if (value.kind === 'error' && typeof value.message === 'string') {
        const error = new Error(value.message);
        error.name = typeof value.name === 'string' ? value.name : 'Error';
        finish(() => reject(error));
      } else if (value.kind === 'progress') {
        const completed = Number(value.completed);
        const total = Number(value.total);
        if (
          !Number.isSafeInteger(completed) ||
          !Number.isSafeInteger(total) ||
          total !== frame.layers.length ||
          completed < 1 ||
          completed > total ||
          completed < lastCompleted
        ) {
          finish(() =>
            reject(new Error('Worker returned invalid render progress.')),
          );
          return;
        }
        lastCompleted = completed;
        try {
          options.onProgress?.(completed, total);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (value.kind === 'tiled-telemetry') {
        if (!validTiledRenderTelemetry(value.telemetry)) {
          finish(() => reject(new Error('Worker returned invalid tiled telemetry.')));
          return;
        }
        try {
          options.onTiledTelemetry?.(value.telemetry);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (
        value.kind === 'result' &&
        value.width === frame.w &&
        value.height === frame.h &&
        value.image &&
        typeof (value.image as ImageBitmap).close === 'function' &&
        (value.image as ImageBitmap).width === frame.w &&
        (value.image as ImageBitmap).height === frame.h
      ) {
        finish(() => resolve(value.image as ImageBitmap));
      } else if (
        value.kind === 'result-bytes' &&
        value.width === frame.w &&
        value.height === frame.h &&
        value.bytes instanceof ArrayBuffer &&
        value.bytes.byteLength > 0 &&
        value.bytes.byteLength <= 64 * 1024 * 1024
      ) {
        void createImageBitmap(
          new Blob([value.bytes], { type: 'image/png' }),
        ).then(
          (image) => {
            if (settled || isCancelled()) {
              image.close();
              if (!settled) cancel();
              return;
            }
            if (image.width !== frame.w || image.height !== frame.h) {
              image.close();
              finish(() => reject(new Error('Worker decoded an invalid render size.')));
              return;
            }
            finish(() => resolve(image));
          },
          (error) => finish(() => reject(error)),
        );
      } else if (value.kind === 'result' || value.kind === 'result-bytes') {
        closeResult();
        const dimensionsMatch =
          value.width === frame.w && value.height === frame.h;
        finish(() =>
          reject(
            new Error(
              dimensionsMatch
                ? 'Worker returned an invalid render result.'
                : 'Worker returned an invalid render size.',
            ),
          ),
        );
      }
    };
    worker.onerror = () =>
      finish(() => reject(new Error('Worker document rendering failed')));
    worker.onmessageerror = () =>
      finish(() =>
        reject(new Error('Worker document render response could not be read')),
      );
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) return cancel();
    try {
      // Do not clone every asset retained by undo history. A render only needs
      // the current frame's raster and mask references.
      worker.postMessage({
        kind: 'render',
        id,
        frame,
        assets: referencedAssets([frame], assets),
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

type PersistentFallback = () => Promise<CanvasImageSource>;
type PersistentTask = {
  id: number;
  frame: Frame;
  assets: Assets;
  options: WorkerRenderOptions;
  fallback: PersistentFallback;
  resolve: (image: CanvasImageSource) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  cancelRequested: boolean;
  lastCompleted: number;
  timeout?: ReturnType<typeof setTimeout>;
  abortHandler?: () => void;
};

/**
 * One-worker latest-wins session used by the editor's committed render path.
 * The worker is reused while idle, but a cancelled request is never allowed
 * to publish into a newer request. An idle timer releases the worker and the
 * worker-side decoded asset cache is cleared between requests.
 */
class PersistentWorkerSession {
  private worker?: Worker;
  private active?: PersistentTask;
  private queued?: PersistentTask;
  private idleTimer?: ReturnType<typeof setTimeout>;

  submit(
    frame: Frame,
    assets: Assets,
    options: WorkerRenderOptions,
    fallback: PersistentFallback,
  ): Promise<CanvasImageSource> {
    const id = ++requestId;
    return new Promise<CanvasImageSource>((resolve, reject) => {
      const task: PersistentTask = {
        id,
        frame,
        assets,
        options,
        fallback,
        resolve,
        reject,
        settled: false,
        cancelRequested: false,
        lastCompleted: 0,
      };
      task.abortHandler = () => this.cancel(task);
      options.signal?.addEventListener('abort', task.abortHandler, {
        once: true,
      });
      if (options.signal?.aborted || options.isCancelled?.()) {
        task.settled = true;
        reject(abortError());
        return;
      }
      if (this.queued) this.rejectQueued(this.queued);
      if (this.active) {
        this.queued = task;
        this.cancel(this.active);
      } else this.start(task);
    });
  }

  private rejectQueued(task: PersistentTask): void {
    task.settled = true;
    if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
    task.reject(abortError());
    if (this.queued === task) this.queued = undefined;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(
      new URL('./document-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (event) => this.onMessage(event.data);
    this.worker.onerror = () => this.onWorkerFailure(new Error('Worker document rendering failed'));
    this.worker.onmessageerror = () =>
      this.onWorkerFailure(new Error('Worker document render response could not be read'));
    return this.worker;
  }

  private start(task: PersistentTask): void {
    this.clearIdleTimer();
    // Mark the task active before constructing/posting so a constructor or
    // postMessage failure can settle it through the normal fallback path.
    this.active = task;
    try {
      const worker = this.ensureWorker();
      task.timeout = setTimeout(() => {
        this.onWorkerFailure(
          new Error('Worker rendering timed out. Try a smaller image or fewer layers.'),
        );
      }, RENDER_TIMEOUT_MS);
      worker.postMessage({
        kind: 'render',
        id: task.id,
        frame: task.frame,
        assets: referencedAssets([task.frame], task.assets),
      });
    } catch {
      this.finish(task, () => {
        void task.fallback().then(task.resolve, task.reject);
      });
      void this.startNext();
    }
  }

  private cancel(task: PersistentTask): void {
    if (task.cancelRequested) return;
    task.cancelRequested = true;
    if (!task.settled) {
      task.settled = true;
      if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
      task.reject(abortError());
    }
    if (this.active === task) {
      try {
        this.worker?.postMessage({ kind: 'cancel', id: task.id });
      } catch {
        this.onWorkerFailure(abortError());
      }
    } else if (this.queued === task) {
      this.queued = undefined;
    }
  }

  private onMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const value = message as Record<string, unknown>;
    const task = this.active;
    if (!task || value.id !== task.id) {
      if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
        (value.image as ImageBitmap).close();
      return;
    }
    if (value.kind === 'cancelled') {
      this.finish(task);
      void this.startNext();
      return;
    }
    if (task.cancelRequested || task.options.signal?.aborted || task.options.isCancelled?.()) {
      if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
        (value.image as ImageBitmap).close();
      this.cancel(task);
      if (value.kind === 'result' || value.kind === 'result-bytes' || value.kind === 'error') {
        this.finish(task);
        void this.startNext();
      }
      return;
    }
    if (value.kind === 'error' && typeof value.message === 'string') {
      const error = new Error(value.message);
      error.name = typeof value.name === 'string' ? value.name : 'Error';
      this.finish(task, () => {
        if (!task.settled) task.reject(error);
      });
      void this.startNext();
      return;
    }
    if (value.kind === 'progress') {
      const completed = Number(value.completed);
      const total = Number(value.total);
      if (
        !Number.isSafeInteger(completed) ||
        !Number.isSafeInteger(total) ||
        total !== task.frame.layers.length ||
        completed < 1 ||
        completed > total ||
        completed < task.lastCompleted
      ) {
        this.onWorkerFailure(new Error('Worker returned invalid render progress.'));
        return;
      }
      task.lastCompleted = completed;
      try {
        task.options.onProgress?.(completed, total);
      } catch (error) {
        this.finish(task, () => {
          if (!task.settled) task.reject(error);
        });
        void this.startNext();
      }
      return;
    }
    if (value.kind === 'tiled-telemetry') {
      if (!validTiledRenderTelemetry(value.telemetry)) {
        this.onWorkerFailure(new Error('Worker returned invalid tiled telemetry.'));
        return;
      }
      try {
        task.options.onTiledTelemetry?.(value.telemetry);
      } catch (error) {
        this.finish(task, () => {
          if (!task.settled) task.reject(error);
        });
        void this.startNext();
      }
      return;
    }
    if (
      value.kind === 'result' &&
      value.width === task.frame.w &&
      value.height === task.frame.h &&
      value.image &&
      typeof (value.image as ImageBitmap).close === 'function' &&
      (value.image as ImageBitmap).width === task.frame.w &&
      (value.image as ImageBitmap).height === task.frame.h
    ) {
      this.finish(task, () => task.resolve(value.image as ImageBitmap));
      void this.startNext();
      return;
    }
    if (
      value.kind === 'result-bytes' &&
      value.width === task.frame.w &&
      value.height === task.frame.h &&
      value.bytes instanceof ArrayBuffer &&
      value.bytes.byteLength > 0 &&
      value.bytes.byteLength <= 64 * 1024 * 1024
    ) {
      void createImageBitmap(new Blob([value.bytes], { type: 'image/png' })).then(
        (image) => {
          if (this.active !== task || task.cancelRequested || task.options.signal?.aborted || task.options.isCancelled?.()) {
            image.close();
            this.cancel(task);
            return;
          }
          if (image.width !== task.frame.w || image.height !== task.frame.h) {
            image.close();
            this.finish(task, () => {
              if (!task.settled) task.reject(new Error('Worker decoded an invalid render size.'));
            });
          } else {
            this.finish(task, () => task.resolve(image));
          }
          void this.startNext();
        },
        (error) => {
          this.finish(task, () => {
            if (!task.settled) task.reject(error);
          });
          void this.startNext();
        },
      );
      return;
    }
    if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
      (value.image as ImageBitmap).close();
    this.finish(task, () => {
      if (!task.settled) task.reject(new Error('Worker returned an invalid render result.'));
    });
    void this.startNext();
  }

  private onWorkerFailure(error: Error): void {
    const worker = this.worker;
    this.worker = undefined;
    try { worker?.terminate(); } catch { /* already unavailable */ }
    const task = this.active;
    this.active = undefined;
    if (task) {
      this.clearTask(task);
      if (!task.settled) task.reject(error);
    }
    void this.startNext();
  }

  private finish(task: PersistentTask, callback?: () => void): void {
    if (this.active !== task) return;
    this.active = undefined;
    this.clearTask(task);
    callback?.();
  }

  private clearTask(task: PersistentTask): void {
    if (task.timeout) clearTimeout(task.timeout);
    task.timeout = undefined;
    if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
    task.abortHandler = undefined;
    if (this.queued === task) this.queued = undefined;
  }

  private async startNext(): Promise<void> {
    const next = this.queued;
    this.queued = undefined;
    if (next) {
      if (next.options.signal?.aborted || next.options.isCancelled?.()) {
        if (!next.settled) {
          next.settled = true;
          next.reject(abortError());
        }
        return this.startNext();
      }
      this.start(next);
      return;
    }
    this.scheduleIdleTimer();
  }

  private scheduleIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      const worker = this.worker;
      this.worker = undefined;
      try { worker?.terminate(); } catch { /* already unavailable */ }
    }, RENDER_TIMEOUT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  dispose(): void {
    this.clearIdleTimer();
    const worker = this.worker;
    this.worker = undefined;
    const active = this.active;
    this.active = undefined;
    const queued = this.queued;
    this.queued = undefined;
    try { worker?.terminate(); } catch { /* already unavailable */ }
    for (const task of [active, queued]) {
      if (task && !task.settled) {
        task.settled = true;
        task.reject(abortError());
      }
    }
  }
}

const persistentSession = new PersistentWorkerSession();

/** Test/host teardown hook; production lifecycle is managed by the idle timer. */
export function resetPersistentWorkerForTests(): void {
  persistentSession.dispose();
}

function persistentWorkerRender(
  frame: Frame,
  assets: Assets,
  options: WorkerRenderOptions,
  fallback: PersistentFallback,
): Promise<CanvasImageSource> {
  try {
    return persistentSession.submit(frame, assets, options, fallback);
  } catch {
    return fallback();
  }
}
