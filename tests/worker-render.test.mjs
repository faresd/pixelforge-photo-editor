import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canRenderInWorker,
  renderFrameWithWorker,
} from '../src/workerRender.ts';
import { neutral } from '../src/document.ts';

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

function rectangleFrame() {
  const id = '00000000-0000-4000-8000-000000000001';
  return {
    w: 1,
    h: 1,
    layers: [
      {
        id,
        name: 'shape',
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        matrix: [1, 0, 0, 1, 0, 0],
        adjustments: structuredClone(neutral),
        kind: 'rectangle',
        width: 1,
        height: 1,
        color: '#ff0000',
        stroke: 1,
        fill: true,
      },
    ],
    active: id,
  };
}

test('worker renderer is opt-in when OffscreenCanvas is unavailable', () => {
  assert.equal(canRenderInWorker(), false);
});

test('worker renderer rejects a forged result size and terminates', async () => {
  const workers = [];
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 2,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render size/,
    );
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer surfaces a bounded worker error without waiting for the timeout', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'error',
              id: message.id,
              name: 'DataError',
              message: 'Invalid frame payload',
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      (error) =>
        error?.name === 'DataError' &&
        error?.message === 'Invalid frame payload',
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer forwards monotonic bounded layer progress', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() => {
          this.onmessage?.({
            data: { kind: 'progress', id: message.id, completed: 1, total: 1 },
          });
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          });
        });
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const progress = [];
    await renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    assert.deepEqual(progress, [[1, 1]]);
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer rejects forged or regressing progress before accepting output', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() => {
          this.onmessage?.({
            data: { kind: 'progress', id: message.id, completed: 2, total: 1 },
          });
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          });
        });
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render progress/,
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer rejects a malformed result without accepting a stale image', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: {},
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render result/,
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer aborts, posts cancellation and cleans up', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.messages = [];
      this.terminated = false;
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const controller = new AbortController();
    const pending = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      signal: controller.signal,
      forceWorker: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    assert.equal(worker.terminated, true);
    assert.equal(worker.messages.at(-1).kind, 'cancel');
  } finally {
    restoreGlobals();
  }
});

test('pre-cancelled fallback rejects before canvas allocation, including live overrides', async () => {
  const controller = new AbortController();
  controller.abort();
  for (const overrides of [undefined, {}]) {
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, overrides, {
      signal: controller.signal,
    }), (error) => error.name === 'AbortError');
  }
  await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
    isCancelled: () => true,
  }), (error) => error.name === 'AbortError');
});

async function withByteWorker(run) {
  let worker;
  class FakeOffscreenCanvas {
    getContext() { return {}; }
    transferToImageBitmap() { return {}; }
  }
  class FakeWorker {
    constructor() { worker = this; this.terminated = false; }
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => this.onmessage?.({data: {
        kind: 'result-bytes', id: message.id, width: 1, height: 1,
        bytes: new ArrayBuffer(1),
      }}));
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  try { await run(() => worker); } finally { restoreGlobals(); }
}

test('bitmap decode completing after abort closes the unused allocation', async () => {
  await withByteWorker(async (getWorker) => {
    let completeDecode;
    let closed = 0;
    setGlobal('createImageBitmap', () => new Promise(resolve => { completeDecode = resolve; }));
    const controller = new AbortController();
    const result = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, signal: controller.signal,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(result, error => error.name === 'AbortError');
    completeDecode({width: 1, height: 1, close() { closed++; }});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('encoded result checks decoded dimensions and closes forged output', async () => {
  await withByteWorker(async (getWorker) => {
    let closed = 0;
    setGlobal('createImageBitmap', async () => ({width: 2, height: 1, close() { closed++; }}));
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
    }), /decoded an invalid render size/);
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('callback cancellation during bitmap decode closes output and rejects', async () => {
  await withByteWorker(async (getWorker) => {
    let cancelled = false;
    let closed = 0;
    setGlobal('createImageBitmap', async () => {
      cancelled = true;
      return {width: 1, height: 1, close() { closed++; }};
    });
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, isCancelled: () => cancelled,
    }), error => error.name === 'AbortError');
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('bitmap response validates actual size and releases rejected output', async () => {
  let closed = 0;
  let terminated = false;
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'result', id: message.id, width: 1, height: 1,
        image: { width: 2, height: 1, close() { closed++; } },
      } }));
    }
    terminate() { terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
    }), /invalid render result/);
    assert.equal(closed, 1);
    assert.equal(terminated, true);
  } finally { restoreGlobals(); }
});

test('unrelated bitmap response is released without settling the active request', async () => {
  let unrelatedClosed = 0;
  let acceptedClosed = 0;
  const expected = {width: 1, height: 1, close() { acceptedClosed++; }};
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({data: {kind: 'result', id: message.id + 1, width: 1, height: 1,
          image: {width: 1, height: 1, close() { unrelatedClosed++; }}}});
        this.onmessage?.({data: {kind: 'result', id: message.id, width: 1, height: 1, image: expected}});
      });
    }
    terminate() {}
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const result = await renderFrameWithWorker(rectangleFrame(), {}, undefined, {forceWorker: true});
    assert.equal(result, expected);
    assert.equal(unrelatedClosed, 1);
    assert.equal(acceptedClosed, 0);
    result.close();
    assert.equal(acceptedClosed, 1);
  } finally { restoreGlobals(); }
});
