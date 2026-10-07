import {
  referencedAssets,
  renderFrame,
  validateFrame,
  type Assets,
  type Frame,
} from './document.ts';

export type WorkerRenderOptions = {
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  /** Report completed layer passes for visible large-render progress. */
  onProgress?: (completed: number, total: number) => void;
  /** Test/diagnostic override; normal editing selects workers for larger frames. */
  forceWorker?: boolean;
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
      isCancelled,
      onProgress: options.onProgress,
      yieldEveryLayers: 1,
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
