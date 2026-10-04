import {
  bindActionParameters,
  type ActionParameterValues,
  type ActionSet,
  type ActionStep,
} from './actions.ts';

/** Keep anonymous batch work bounded on memory-constrained devices. */
export const MAX_BATCH_ACTION_ITEMS = 64;
export const MAX_BATCH_ACTION_STEPS = 64;

export type BatchActionProgress = {
  completed: number;
  total: number;
  source: string;
  status: 'exported' | 'failed';
};

export type BatchActionFailure = {
  source: string;
  reason: string;
};

export type BatchActionResult<T> = {
  results: T[];
  failures: BatchActionFailure[];
  completed: number;
  cancelled: boolean;
};

export type BatchActionItem<T> = {
  source: string;
  value: T;
};

export type BatchActionQueueOptions = {
  onProgress?: (progress: BatchActionProgress) => void;
  signal?: AbortSignal;
  parameters?: ActionParameterValues;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Batch action cancelled', 'AbortError');
}

function safeReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 240);
  return 'The action could not be applied to this file.';
}

/**
 * Run one reusable recipe against a bounded sequence. Items are deliberately
 * processed one at a time: this keeps memory predictable, isolates failures,
 * and gives Escape/cancel a deterministic boundary between files.
 */
export async function runBatchActionQueue<T, U>(
  action: ActionSet,
  items: Array<BatchActionItem<T>>,
  execute: (item: BatchActionItem<T>, boundAction: ActionSet) => Promise<U> | U,
  options: BatchActionQueueOptions = {},
): Promise<BatchActionResult<U>> {
  if (items.length > MAX_BATCH_ACTION_ITEMS)
    throw new RangeError(`Batch Actions support at most ${MAX_BATCH_ACTION_ITEMS} files.`);
  if (action.steps.length > MAX_BATCH_ACTION_STEPS)
    throw new RangeError(`An Action can contain at most ${MAX_BATCH_ACTION_STEPS} steps.`);
  const boundAction = bindActionParameters(action, options.parameters || {});
  const results: U[] = [];
  const failures: BatchActionFailure[] = [];
  let completed = 0;
  for (const item of items) {
    if (options.signal?.aborted)
      return { results, failures, completed, cancelled: true };
    try {
      const result = await execute(item, boundAction);
      results.push(result);
      completed += 1;
      options.onProgress?.({
        completed,
        total: items.length,
        source: item.source,
        status: 'exported',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return { results, failures, completed, cancelled: true };
      failures.push({ source: item.source, reason: safeReason(error) });
      completed += 1;
      options.onProgress?.({
        completed,
        total: items.length,
        source: item.source,
        status: 'failed',
      });
    }
  }
  throwIfAborted(options.signal);
  return { results, failures, completed, cancelled: false };
}

/**
 * Apply the deterministic subset of recorded Actions that is safe for a
 * flattened image batch. Editor-only commands fail per file with an explicit
 * reason rather than silently changing semantics.
 */
export function applyBatchActionToCanvas(
  input: HTMLCanvasElement,
  action: ActionSet,
  signal?: AbortSignal,
): HTMLCanvasElement {
  let canvas = input;
  for (const step of action.steps) {
    throwIfAborted(signal);
    canvas = applyBatchActionStep(canvas, step);
  }
  return canvas;
}

function numberParameter(step: ActionStep, name: string, fallback: number): number {
  const value = step.parameters?.[name];
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applyBatchActionStep(input: HTMLCanvasElement, step: ActionStep): HTMLCanvasElement {
  const context = input.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  const output = document.createElement('canvas');
  const rotate = step.command === 'rotate-left' || step.command === 'rotate-right';
  output.width = rotate ? input.height : input.width;
  output.height = rotate ? input.width : input.height;
  const target = output.getContext('2d');
  if (!target) throw new Error('Canvas rendering is unavailable in this browser.');

  if (step.command === 'reset') {
    target.drawImage(input, 0, 0);
    return output;
  }
  if (step.command === 'flip-h' || step.command === 'flip-v') {
    target.translate(step.command === 'flip-h' ? output.width : 0, step.command === 'flip-v' ? output.height : 0);
    target.scale(step.command === 'flip-h' ? -1 : 1, step.command === 'flip-v' ? -1 : 1);
    target.drawImage(input, 0, 0);
    return output;
  }
  if (rotate) {
    target.translate(output.width / 2, output.height / 2);
    target.rotate(step.command === 'rotate-left' ? -Math.PI / 2 : Math.PI / 2);
    target.drawImage(input, -input.width / 2, -input.height / 2);
    return output;
  }
  const filters: Record<string, string> = {
    'filter-original': 'none',
    'filter-vivid': `saturate(${Math.max(0, Math.min(3, 1 + numberParameter(step, 'amount', 45) / 100))}) contrast(1.08)`,
    'filter-mono': 'grayscale(1) contrast(1.12)',
    'filter-warm': 'sepia(.35) saturate(1.2)',
    'filter-cool': 'hue-rotate(18deg) saturate(.9)',
  };
  if (Object.prototype.hasOwnProperty.call(filters, step.command)) {
    target.filter = filters[step.command];
    target.drawImage(input, 0, 0);
    return output;
  }
  throw new Error(`Action step “${step.label}” is not supported for flattened batch images.`);
}

/** Keep the persisted/exported Action descriptor free of file bytes and paths. */
export function publicBatchActionDescriptor(action: ActionSet) {
  return {
    id: action.id,
    name: action.name,
    stepCount: action.steps.length,
    commands: action.steps.map((step) => step.command),
  };
}
