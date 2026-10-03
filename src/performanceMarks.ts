/**
 * Small, optional performance instrumentation for editor operations.
 *
 * Marks are deliberately best effort: a browser can disable the Performance
 * API, and a measurement must never make an edit fail. Every span keeps a
 * unique start/end pair so overlapping renders do not produce a misleading
 * duration. A stable operation mark is also emitted for release diagnostics.
 */
export type PerformanceSpan = {
  readonly id: number;
  finish: () => void;
  cancel: () => void;
};

let nextSpanId = 0;

function mark(name: string): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark(name);
  } catch {
    // Instrumentation is optional and must never affect editing.
  }
}

function measure(name: string, start: string, end: string): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.measure === 'function')
      performance.measure(name, start, end);
  } catch {
    // A browser may evict marks while a long operation is running.
  }
}

/** Start a best-effort operation span. Call finish or cancel exactly once. */
export function beginPerformanceSpan(operation: string): PerformanceSpan {
  const safeOperation = /^[a-z][a-z0-9-]{0,40}$/i.test(operation)
    ? operation
    : 'unknown';
  const id = ++nextSpanId;
  const prefix = `pixelforge.${safeOperation}`;
  const start = `${prefix}.start.${id}`;
  const end = `${prefix}.end.${id}`;
  mark(start);
  // Stable marks make the latest activity discoverable in DevTools and tests.
  mark(`${prefix}.start`);
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    mark(end);
    mark(`${prefix}.end`);
    measure(prefix, start, end);
    mark(`${prefix}.latest`);
  };
  return {
    id,
    finish,
    cancel: () => {
      if (settled) return;
      settled = true;
      mark(`${prefix}.cancelled`);
    },
  };
}

/** Reset the module counter in deterministic unit tests. */
export function resetPerformanceSpanIds(): void {
  nextSpanId = 0;
}
