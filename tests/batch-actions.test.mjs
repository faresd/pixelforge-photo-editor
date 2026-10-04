import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendActionStep,
  bindActionParameters,
  createActionSet,
} from '../src/actions.ts';
import {
  MAX_BATCH_ACTION_ITEMS,
  runBatchActionQueue,
} from '../src/batchActions.ts';

const now = new Date('2026-10-04T10:00:00.000Z');

test('parameterized actions bind primitive full tokens and embedded labels without mutating recipes', () => {
  const action = appendActionStep(
    createActionSet('Finisher', 'action-params', now),
    'filter-vivid',
    'Vivid {{strength}}%',
    { amount: '{{strength}}', label: 'finish-{{strength}}' },
    'step-params',
    now,
  );
  const bound = bindActionParameters(action, { strength: 70 });
  assert.equal(bound.steps[0].parameters?.amount, 70);
  assert.equal(bound.steps[0].parameters?.label, 'finish-70');
  assert.equal(action.steps[0].parameters?.amount, '{{strength}}');
  assert.throws(() => bindActionParameters(action), /Missing action parameter: strength/);
});

test('batch Action queue isolates per-file failures and reports privacy-safe progress', async () => {
  const progress = [];
  const action = appendActionStep(
    createActionSet('Batch', 'action-queue', now),
    'filter-original',
    'Original',
    undefined,
    'step-queue',
    now,
  );
  const result = await runBatchActionQueue(
    action,
    [
      { source: 'portrait.png', value: 1 },
      { source: 'broken.png', value: 2 },
      { source: 'landscape.png', value: 3 },
    ],
    async (item) => {
      if (item.value === 2) throw new Error('Unsupported image data');
      return item.value * 2;
    },
    { onProgress: (event) => progress.push(event) },
  );
  assert.deepEqual(result.results, [2, 6]);
  assert.deepEqual(result.failures, [{ source: 'broken.png', reason: 'Unsupported image data' }]);
  assert.equal(result.completed, 3);
  assert.equal(result.cancelled, false);
  assert.deepEqual(progress.map(({ source, status, completed, total }) => ({ source, status, completed, total })), [
    { source: 'portrait.png', status: 'exported', completed: 1, total: 3 },
    { source: 'broken.png', status: 'failed', completed: 2, total: 3 },
    { source: 'landscape.png', status: 'exported', completed: 3, total: 3 },
  ]);
  assert.equal(JSON.stringify(result).includes('data:'), false);
});

test('batch Action queue cancels between files and enforces bounded input count', async () => {
  const controller = new AbortController();
  const action = appendActionStep(
    createActionSet('Cancel', 'action-cancel', now),
    'filter-original',
    'Original',
    undefined,
    'step-cancel',
    now,
  );
  const seen = [];
  const result = await runBatchActionQueue(
    action,
    [
      { source: 'one.png', value: 1 },
      { source: 'two.png', value: 2 },
    ],
    async (item) => {
      seen.push(item.value);
      controller.abort();
      return item.value;
    },
    { signal: controller.signal },
  );
  assert.deepEqual(seen, [1]);
  assert.equal(result.completed, 1);
  assert.equal(result.cancelled, true);
  await assert.rejects(
    runBatchActionQueue(
      action,
      Array.from({ length: MAX_BATCH_ACTION_ITEMS + 1 }, (_, value) => ({
        source: `image-${value}.png`,
        value,
      })),
      () => 1,
    ),
    /at most 64 files/,
  );
});
