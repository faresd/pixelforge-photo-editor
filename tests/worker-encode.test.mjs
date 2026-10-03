import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEncodeInWorker, encodeImageWithWorker } from '../src/workerEncode.ts';

const savedGlobals = new Map();
function setGlobal(name, value) {
  if (!savedGlobals.has(name)) savedGlobals.set(name, globalThis[name]);
  globalThis[name] = value;
}
function restoreGlobals() {
  for (const [name, value] of savedGlobals) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  savedGlobals.clear();
}

test('worker encoding advertises a safe Canvas2D fallback in non-worker runtimes', async () => {
  assert.equal(canEncodeInWorker(), false);
  const image = {
    width: 1,
    height: 1,
    toBlob(callback, type) {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type }));
    },
    getContext() { return null; },
  };
  const blob = await encodeImageWithWorker(image, 'png', 90);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 3);
});

test('worker fallback rejects malformed export quality before creating work', async () => {
  const image = {
    width: 1,
    height: 1,
    toBlob() { throw new Error('should not encode'); },
    getContext() { return null; },
  };
  await assert.rejects(
    encodeImageWithWorker(image, 'webp', 0),
    /supported format and quality/,
  );
});

test('worker path validates dimensions before constructing a worker', async () => {
  let constructed = false;
  class ThrowingWorker { constructor() { constructed = true; } }
  setGlobal('Worker', ThrowingWorker);
  setGlobal('OffscreenCanvas', class {});
  setGlobal('ImageData', class {});
  try {
    await assert.rejects(
      encodeImageWithWorker({ width: 5000, height: 5000 }, 'png', 90),
      /no larger|pixels/,
    );
    assert.equal(constructed, false);
  } finally { restoreGlobals(); }
});

test('fallback cancellation rejects even when toBlob completes later', async () => {
  const controller = new AbortController();
  const image = {
    width: 1,
    height: 1,
    toBlob(callback, type) { setTimeout(() => callback(new Blob([new Uint8Array([1])], { type })), 20); },
    getContext() { return null; },
  };
  const pending = encodeImageWithWorker(image, 'png', 90, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
});

test('mocked worker reports progress, transfers a result and terminates cleanly', async () => {
  const workers = [];
  class FakeWorker {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(message) {
      this.messages.push(message);
      if (message.kind === 'encode') {
        queueMicrotask(() => this.onmessage?.({ data: { kind: 'progress', id: message.id, completed: 1, total: 1 } }));
        queueMicrotask(() => this.onmessage?.({ data: { kind: 'result', id: message.id, blob: new Blob([new Uint8Array([7])], { type: 'image/png' }) } }));
      }
    }
    terminate() { this.terminated = true; }
  }
  class FakeImageData { constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); } }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', class {});
  setGlobal('ImageData', FakeImageData);
  try {
    const progress = [];
    const image = { width: 1, height: 1, getContext() { return { getImageData() { return { data: new Uint8ClampedArray(4) }; } }; } };
    const blob = await encodeImageWithWorker(image, 'png', 90, { onProgress: (done, total) => progress.push([done, total]) });
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(progress, [[1, 1]]);
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[0].messages[0].kind, 'encode');
  } finally { restoreGlobals(); }
});

test('mocked worker abort sends cancellation and cleans up', async () => {
  const controller = new AbortController();
  let worker;
  class FakeWorker {
    constructor() { worker = this; this.messages = []; this.terminated = false; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', class {});
  setGlobal('ImageData', class {});
  try {
    const image = { width: 1, height: 1, getContext() { return { getImageData() { return { data: new Uint8ClampedArray(4) }; } }; } };
    const pending = encodeImageWithWorker(image, 'png', 90, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    assert.equal(worker.terminated, true);
    assert.equal(worker.messages.at(-1).kind, 'cancel');
  } finally { restoreGlobals(); }
});
