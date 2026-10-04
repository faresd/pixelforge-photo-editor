import { test, expect, type Page } from '@playwright/test';

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

function draftId(page: Page) {
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

async function replaceWithLargeBundle(page: Page, id: string) {
  await page.evaluate(async (draftId) => {
    const pointerAndChunks = await new Promise<{
      pointer: Record<string, unknown>;
      chunks: Array<{ id: string; bundleId: string; index: number; bytes: ArrayBuffer }>;
    }>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents', 2);
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs']);
        const pointerRequest = transaction.objectStore('drafts').get(draftId);
        pointerRequest.onerror = () => reject(pointerRequest.error);
        pointerRequest.onsuccess = () => {
          const pointer = pointerRequest.result as Record<string, unknown>;
          const keys = pointer.chunks as string[];
          const requests = keys.map((key) => transaction.objectStore('draftBlobs').get(key));
          const chunks: Array<{ id: string; bundleId: string; index: number; bytes: ArrayBuffer }> = [];
          requests.forEach((request, index) => {
            request.onsuccess = () => { chunks[index] = request.result; };
          });
          transaction.oncomplete = () => {
            database.close();
            resolve({ pointer, chunks });
          };
        };
      };
    });
    const source = pointerAndChunks.chunks.reduce(
      (total, chunk) => total + chunk.bytes.byteLength,
      0,
    );
    const payload = new Uint8Array(source + 5 * 1024 * 1024);
    let offset = 0;
    pointerAndChunks.chunks.forEach((chunk) => {
      payload.set(new Uint8Array(chunk.bytes), offset);
      offset += chunk.bytes.byteLength;
    });
    const original = JSON.parse(new TextDecoder().decode(payload.slice(0, source))) as Record<string, unknown>;
    // Unknown draft fields are intentionally retained by the versioned envelope;
    // this makes the fixture large without changing any rendered pixels.
    original.__largeRecoveryFixture = 'x'.repeat(5 * 1024 * 1024);
    const encoded = new TextEncoder().encode(JSON.stringify(original));
    const chunkSize = 64 * 1024;
    const bundleId = crypto.randomUUID();
    const chunks = Array.from({ length: Math.ceil(encoded.byteLength / chunkSize) }, (_, index) => {
      const bytes = encoded.slice(index * chunkSize, Math.min((index + 1) * chunkSize, encoded.byteLength));
      return {
        id: `${bundleId}:${index.toString(36)}`,
        bundleId,
        index,
        bytes: bytes.buffer,
      };
    });
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const manifest = {
      kind: 'pixelforge-draft-bundle',
      version: 1,
      id: bundleId,
      revision: pointerAndChunks.pointer.localRevision,
      localRevision: pointerAndChunks.pointer.localRevision,
      checksum,
      byteLength: encoded.byteLength,
      chunkSize,
      chunkCount: chunks.length,
      chunks: chunks.map((chunk) => chunk.id),
      name: pointerAndChunks.pointer.name,
      createdAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents', 2);
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs'], 'readwrite');
        const pointers = transaction.objectStore('drafts');
        const blobs = transaction.objectStore('draftBlobs');
        (pointerAndChunks.pointer.chunks as string[]).forEach((key) => blobs.delete(key));
        chunks.forEach((chunk) => blobs.put(chunk, chunk.id));
        pointers.put(manifest, draftId);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, id);
}

async function corruptOneChunk(page: Page, id: string) {
  await page.evaluate(async (draftId) => {
    await new Promise<void>((resolve, reject) => {
      const opened = indexedDB.open('pixelforge-documents', 2);
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction(['drafts', 'draftBlobs'], 'readwrite');
        const pointers = transaction.objectStore('drafts');
        const blobs = transaction.objectStore('draftBlobs');
        const pointerRequest = pointers.get(draftId);
        pointerRequest.onsuccess = () => {
          const pointer = pointerRequest.result as { chunks: string[] };
          const chunkRequest = blobs.get(pointer.chunks[0]);
          chunkRequest.onsuccess = () => {
            const chunk = chunkRequest.result as { bytes: ArrayBuffer };
            const bytes = chunk.bytes.slice(0);
            new Uint8Array(bytes)[0] ^= 0xff;
            blobs.put({ ...chunk, bytes }, pointer.chunks[0]);
          };
        };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, id);
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('large local bundle survives reload and exposes a versioned manifest', async ({ page }) => {
  const id = draftId(page);
  await replaceWithLargeBundle(page, id);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
  await expect(page.getByLabel('Document name')).toHaveValue('untitled');
});

test('checksum corruption fails closed without adopting damaged draft bytes', async ({ page }) => {
  const id = draftId(page);
  await replaceWithLargeBundle(page, id);
  await corruptOneChunk(page, id);
  await page.reload();
  await expect(page.getByText('Recovery unavailable. Original draft kept; export backups of your work.', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(id);
});
