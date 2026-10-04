import { test, expect, type Page } from '@playwright/test';

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );

type DraftProbe = {
  name?: string;
  localRevision?: number;
};

function draftId(page: Page) {
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

async function indexedDbDraft(page: Page): Promise<DraftProbe | undefined> {
  return page.evaluate(async () => {
    const id = new URL(location.href).hash.match(
      /^#draft=([a-f0-9-]{36})$/,
    )?.[1];
    if (!id) return undefined;
    return new Promise<DraftProbe | undefined>((resolve) => {
      const opened = indexedDB.open('pixelforge-documents', 1);
      opened.onerror = () => resolve(undefined);
      opened.onsuccess = () => {
        const database = opened.result;
        const request = database
          .transaction('drafts')
          .objectStore('drafts')
          .get(id);
        request.onerror = () => {
          database.close();
          resolve(undefined);
        };
        request.onsuccess = () => {
          const value = request.result as DraftProbe | undefined;
          database.close();
          resolve(
            value && { name: value.name, localRevision: value.localRevision },
          );
        };
      };
    });
  });
}

async function pendingDraft(page: Page): Promise<DraftProbe | undefined> {
  return page.evaluate(() => {
    const id = new URL(location.href).hash.match(
      /^#draft=([a-f0-9-]{36})$/,
    )?.[1];
    if (!id) return undefined;
    const encoded = sessionStorage.getItem(`pixelforge:pending-draft:${id}`);
    if (!encoded) return undefined;
    const parsed = JSON.parse(encoded) as DraftProbe & {
      draft?: DraftProbe;
    };
    const value = parsed.draft || parsed;
    return { name: value.name, localRevision: value.localRevision };
  });
}

async function holdNextSaveCompletion(page: Page) {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      'oncomplete',
    );
    if (!descriptor?.get || !descriptor.set || !descriptor.configurable)
      throw new Error('IndexedDB transaction completion is not interceptable');
    const state: {
      armed: boolean;
      committed: boolean;
      released: boolean;
      event?: Event;
      handler?: (event: Event) => void;
      transaction?: IDBTransaction;
    } = { armed: true, committed: false, released: false };
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get!.call(this);
      },
      set(handler: ((event: Event) => void) | null) {
        if (
          state.armed &&
          this.mode === 'readwrite' &&
          typeof handler === 'function'
        ) {
          state.armed = false;
          state.handler = handler;
          state.transaction = this;
          descriptor.set!.call(this, (event: Event) => {
            // The IndexedDB commit has completed, but leave saveDraft's promise
            // pending so a later edit remains queued behind this transaction.
            state.committed = true;
            state.event = event;
          });
          return;
        }
        descriptor.set!.call(this, handler);
      },
    });
    (
      window as Window & {
        __pixelForgeDraftHold?: {
          state: typeof state;
          release: () => void;
        };
      }
    ).__pixelForgeDraftHold = {
      state,
      release: () => {
        if (
          state.released ||
          !state.handler ||
          !state.event ||
          !state.transaction
        )
          return;
        state.released = true;
        state.handler.call(state.transaction, state.event);
      },
    };
  });
}

async function saveHasCommitted(page: Page) {
  return page.evaluate(() =>
    Boolean(
      (
        window as Window & {
          __pixelForgeDraftHold?: { state?: { committed?: boolean } };
        }
      ).__pixelForgeDraftHold?.state?.committed,
    ),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await saved(page);
});

test('latest rapid edit survives reload after an earlier IndexedDB save commits', async ({
  page,
}) => {
  const id = draftId(page);
  await holdNextSaveCompletion(page);

  await page.getByLabel('Document name').fill('First committed edit');
  await expect.poll(() => saveHasCommitted(page)).toBe(true);
  await expect
    .poll(() => indexedDbDraft(page))
    .toMatchObject({
      name: 'First committed edit',
      localRevision: 2,
    });

  await page.getByLabel('Document name').fill('Latest edit before queued save');
  await expect
    .poll(() => pendingDraft(page))
    .toMatchObject({
      name: 'Latest edit before queued save',
      localRevision: 3,
    });

  // The first save's IDB transaction has committed, while its completion
  // callback (and therefore the queued second save) is still held. Reloading
  // here exercises the tab-scoped write-ahead snapshot recovery path.
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Latest edit before queued save',
  );
  await saved(page);
  await expect
    .poll(() => indexedDbDraft(page))
    .toMatchObject({
      name: 'Latest edit before queued save',
      localRevision: 3,
    });
  expect(new URL(page.url()).hash).toBe(`#draft=${id}`);
});
