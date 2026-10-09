import {
  renderFrame,
  validateFrame,
  clearDecodedAssetCache,
  type Assets,
  type Frame,
} from './document.ts';

type RenderRequest = {
  kind: 'render';
  id: number;
  frame: Frame;
  assets: Assets;
};
type CancelRequest = { kind: 'cancel'; id: number };
type Request = RenderRequest | CancelRequest;
type Response =
  | { kind: 'progress'; id: number; completed: number; total: number }
  | { kind: 'cancelled'; id: number }
  | {
      kind: 'result';
      id: number;
      image: ImageBitmap;
      width: number;
      height: number;
    }
  | {
      kind: 'result-bytes';
      id: number;
      bytes: ArrayBuffer;
      width: number;
      height: number;
    }
  | { kind: 'error'; id: number; name: string; message: string };

const scope = globalThis as typeof globalThis & {
  postMessage: (message: Response, transfer?: Transferable[]) => void;
};
const cancelled = new Set<number>();
let activeId: number | undefined;

function cancellationError(): Error {
  if (typeof DOMException === 'function')
    return new DOMException('Document rendering cancelled', 'AbortError');
  const error = new Error('Document rendering cancelled');
  error.name = 'AbortError';
  return error;
}

function postError(id: number, error: unknown): void {
  const value =
    error instanceof Error ? error : new Error('Document rendering failed');
  scope.postMessage({
    kind: 'error',
    id,
    name: value.name.slice(0, 100),
    message: value.message.slice(0, 2000),
  });
}

async function encodeResult(
  id: number,
  canvas: OffscreenCanvas,
  width: number,
  height: number,
): Promise<void> {
  if (typeof canvas.transferToImageBitmap === 'function') {
    const image = canvas.transferToImageBitmap();
    scope.postMessage({ kind: 'result', id, image, width, height }, [image]);
    return;
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = await blob.arrayBuffer();
  scope.postMessage({ kind: 'result-bytes', id, bytes, width, height }, [
    bytes,
  ]);
}

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request?.kind === 'cancel') {
    cancelled.add(request.id);
    return;
  }
  if (
    !request ||
    request.kind !== 'render' ||
    !Number.isSafeInteger(request.id) ||
    activeId !== undefined
  ) {
    if (request && 'id' in request && Number.isSafeInteger(request.id))
      postError(
        request.id,
        new Error('Worker is busy or the render request is invalid'),
      );
    return;
  }
  activeId = request.id;
  void (async () => {
    let output: OffscreenCanvas | undefined;
    try {
      validateFrame(request.frame, request.assets);
      output = (await renderFrame(
        request.frame,
        request.assets,
        undefined,
        {
          tiledRevision: request.id,
          isCancelled: () => cancelled.has(request.id),
          yieldEveryLayers: 1,
          onProgress: (completed, total) => {
            scope.postMessage({
              kind: 'progress',
              id: request.id,
              completed,
              total,
            });
          },
        },
      )) as unknown as OffscreenCanvas;
      if (cancelled.has(request.id)) throw cancellationError();
      await encodeResult(
        request.id,
        output,
        request.frame.w,
        request.frame.h,
      );
    } catch (error) {
      if (cancelled.has(request.id))
        scope.postMessage({ kind: 'cancelled', id: request.id });
      else postError(request.id, error);
    } finally {
      if (output) {
        output.width = 0;
        output.height = 0;
      }
      clearDecodedAssetCache();
      cancelled.delete(request.id);
      activeId = undefined;
    }
  })();
};
