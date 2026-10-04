import { referencedAssets, renderFrame, validateFrame, type Assets, type Frame } from './document.ts';

export type WorkerRenderOptions = {
  signal?: AbortSignal;
  isCancelled?: () => boolean;
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
      (typeof probe.transferToImageBitmap === 'function' || typeof probe.convertToBlob === 'function')
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
  const globalScope = globalThis as typeof globalThis & {
    __PIXELFORGE_FORCE_WORKER__?: boolean;
  };
  const useWorker =
    options.forceWorker === true ||
    globalScope.__PIXELFORGE_FORCE_WORKER__ === true ||
    frame.w * frame.h >= WORKER_MIN_PIXELS;
  if (overrides || !useWorker || !canRenderInWorker())
    return renderFrame(frame, assets, overrides, {
      isCancelled: options.isCancelled,
    });
  validateFrame(frame, assets);
  if (options.signal?.aborted) throw abortError();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./document-render.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return renderFrame(frame, assets, undefined, {
      isCancelled: options.isCancelled,
    });
  }
  const id = ++requestId;
  return new Promise<CanvasImageSource>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(() => reject(new Error('Worker rendering timed out. Try a smaller image or fewer layers.'))), RENDER_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try { worker.terminate(); } catch { /* Already unavailable. */ }
      callback();
    };
    const cancel = () => {
      try { worker.postMessage({ kind: 'cancel', id }); } catch { /* Worker already stopped. */ }
      finish(() => reject(abortError()));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || (message as { id?: unknown }).id !== id) return;
      const value = message as Record<string, unknown>;
      if (value.kind === 'error' && typeof value.message === 'string') {
        const error = new Error(value.message);
        error.name = typeof value.name === 'string' ? value.name : 'Error';
        finish(() => reject(error));
      } else if (
        value.kind === 'result' &&
        value.width === frame.w &&
        value.height === frame.h &&
        value.image &&
        typeof (value.image as ImageBitmap).close === 'function'
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
        void createImageBitmap(new Blob([value.bytes], { type: 'image/png' })).then(
          (image) => finish(() => resolve(image)),
          (error) => finish(() => reject(error)),
        );
      } else if (value.kind === 'result' || value.kind === 'result-bytes') {
        const dimensionsMatch = value.width === frame.w && value.height === frame.h;
        finish(() => reject(new Error(
          dimensionsMatch
            ? 'Worker returned an invalid render result.'
            : 'Worker returned an invalid render size.',
        )));
      }
    };
    worker.onerror = () => finish(() => reject(new Error('Worker document rendering failed')));
    worker.onmessageerror = () => finish(() => reject(new Error('Worker document render response could not be read')));
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) return cancel();
    try {
      // Do not clone every asset retained by undo history. A render only needs
      // the current frame's raster and mask references.
      worker.postMessage({ kind: 'render', id, frame, assets: referencedAssets([frame], assets) });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
