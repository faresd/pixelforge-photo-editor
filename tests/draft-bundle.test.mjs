import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DRAFT_BUNDLE_CHUNK_BYTES,
  createDraftBundle,
  decodeDraftBundle,
  isDraftBundleChunk,
  isDraftBundleManifest,
  isLegacyDraftRecord,
} from '../src/draftBundle.ts';

const draftId = '11111111-1111-4111-8111-111111111111';
const bundleId = '22222222-2222-4222-8222-222222222222';

function largeDraft() {
  return {
    version: 2,
    localRevision: 17,
    name: 'Large draft fixture',
    // Repetitive content still exercises chunk boundaries without making the
    // test fixture itself noisy or dependent on a browser canvas encoder.
    payload: 'pixel-data-'.repeat(500_000),
  };
}

test('large drafts round-trip through a versioned checksum bundle', async () => {
  const input = largeDraft();
  const bundle = await createDraftBundle(draftId, 17, input, {
    bundleId,
    chunkSize: 64 * 1024,
    now: '2026-10-04T00:00:00.000Z',
  });
  assert.ok(bundle.manifest.byteLength > 4 * 1024 * 1024);
  assert.ok(bundle.manifest.chunkCount > 1);
  assert.equal(bundle.manifest.localRevision, 17);
  assert.equal(bundle.manifest.chunks.length, bundle.chunks.length);
  assert.ok(isDraftBundleManifest(bundle.manifest));
  assert.ok(bundle.chunks.every((chunk) => isDraftBundleChunk(chunk)));
  const reopened = await decodeDraftBundle(bundle.manifest, bundle.chunks);
  assert.deepEqual(reopened, input);
});

test('bundle verification rejects a missing, duplicate or modified chunk', async () => {
  const bundle = await createDraftBundle(draftId, 3, { name: 'integrity', text: 'x'.repeat(90_000) }, {
    bundleId,
    chunkSize: 4096,
  });
  await assert.rejects(
    () => decodeDraftBundle(bundle.manifest, bundle.chunks.slice(0, -1)),
    /incomplete/,
  );
  const duplicate = [...bundle.chunks];
  duplicate[1] = duplicate[0];
  await assert.rejects(
    () => decodeDraftBundle(bundle.manifest, duplicate),
    /chunk index is invalid/,
  );
  const changed = bundle.chunks.map((chunk) => ({
    ...chunk,
    bytes: chunk.bytes.slice(0),
  }));
  new Uint8Array(changed[0].bytes)[0] ^= 0xff;
  await assert.rejects(
    () => decodeDraftBundle(bundle.manifest, changed),
    /checksum mismatch/,
  );
});

test('manifest metadata is self-consistent and forged pointers fail closed', async () => {
  const bundle = await createDraftBundle(draftId, 4, { name: 'pointer' }, { bundleId });
  assert.equal(bundle.manifest.chunkSize, DEFAULT_DRAFT_BUNDLE_CHUNK_BYTES);
  assert.equal(isDraftBundleManifest({ ...bundle.manifest, localRevision: 5 }), false);
  assert.equal(isDraftBundleManifest({ ...bundle.manifest, chunks: ['forged'] }), false);
  assert.equal(isLegacyDraftRecord({ version: 2, name: 'old v1 record' }), true);
  assert.equal(isLegacyDraftRecord(bundle.manifest), false);
});
