import { test, expect, type Page } from '@playwright/test';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const defaults = {
  tool: 'move',
  zoom: 72,
  color: '#ff0000',
  size: 18,
  text: 'Title',
  fontSize: 56,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  filter: 'none',
};
const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return {
    path: path!,
    value: JSON.parse(
      await (await import('node:fs/promises')).readFile(path!, 'utf8'),
    ),
  };
}
const pixels = (page: Page) =>
  page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
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

test('editable text, layer properties, history and assets survive project export and reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Text tool', exact: true }).click();
  await page.getByTestId('editor-canvas').click();
  await page
    .getByLabel('Edit layer text', { exact: true })
    .fill('Editable title');
  await page.getByLabel('Layer name', { exact: true }).fill('Headline');
  await page.getByLabel('Layer font', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Layer X', { exact: true }).fill('100');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await page.getByLabel('Blend mode', { exact: true }).selectOption('screen');
  await page.getByLabel('Layer opacity', { exact: true }).fill('65');
  await saved(page);
  const exported = await project(page),
    frame = exported.value.history[exported.value.index];
  expect(exported.value.version).toBe(2);
  expect(Object.keys(exported.value.assets)).toHaveLength(1);
  expect(frame.layers[1]).toMatchObject({
    kind: 'text',
    text: 'Editable title',
    name: 'Headline',
    opacity: 0.65,
    blend: 'screen',
    fontFamily: 'Georgia',
  });
  expect(frame.layers[1].matrix[4]).toBe(100);
  const before = await pixels(page);
  await page.reload();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  expect(await pixels(page)).toBe(before);
  await page
    .getByLabel('Edit layer text', { exact: true })
    .fill('Revised after reload');
  await saved(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  await page.getByTestId('project-input').setInputFiles(exported.path);
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue(
    'Editable title',
  );
  await saved(page);
  expect(await pixels(page)).toBe(before);
});

test('visibility, locking, duplicate, order and deletion change actual layers without losing originals', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Duplicate layer', exact: true })
    .click();
  await page.getByLabel('Layer name', { exact: true }).fill('Copy');
  await page.getByLabel('Layer X', { exact: true }).fill('400');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await page.getByLabel('Lock layer', { exact: true }).check();
  await expect(
    page.getByRole('button', { name: 'Delete layer', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Layer name', { exact: true })).toBeDisabled();
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Lower layer', exact: true }).click();
  let out = await project(page);
  expect(
    out.value.history[out.value.index].layers.map(
      (l: { name: string }) => l.name,
    ),
  ).toEqual(['Copy', 'Background']);
  expect(Object.keys(out.value.assets)).toHaveLength(1);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  out = await project(page);
  expect(out.value.history[out.value.index].layers[0].visible).toBe(false);
  await page.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Select layer Copy', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(
    page.getByRole('button', { name: 'Select layer Copy', exact: true }),
  ).toBeVisible();
});

test('legacy projects migrate with history and the original bookmark is preserved', async ({
  page,
}) => {
  const oldId = '739d75a0-66c0-4c52-a11c-2b6548dff828';
  await page.evaluate(
    async ({ oldId, png, defaults }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pixelforge-documents', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put(
            {
              version: 1,
              name: 'Legacy safe',
              index: 0,
              history: [{ url: 'data:image/png;base64,' + png, w: 1, h: 1 }],
              settings: defaults,
            },
            oldId,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { oldId, png, defaults },
  );
  await page.goto('/editor#draft=' + oldId);
  await expect(page.getByLabel('Document name')).toHaveValue('Legacy safe');
  await saved(page);
  expect(page.url()).not.toContain(oldId);
  const legacyVersion = await page.evaluate(
    async (oldId) =>
      await new Promise<number>((resolve) => {
        const request = indexedDB.open('pixelforge-documents', 1);
        request.onsuccess = () => {
          const db = request.result,
            read = db.transaction('drafts').objectStore('drafts').get(oldId);
          read.onsuccess = () => {
            resolve(read.result.version);
            db.close();
          };
        };
      }),
    oldId,
  );
  expect(legacyVersion).toBe(1);
  const out = await project(page);
  expect(out.value.version).toBe(2);
  expect(out.value.history[0].layers[0].kind).toBe('raster');
});

test('malformed layer assets are rejected before replacing the current draft', async ({
  page,
}) => {
  const { value } = await project(page),
    id = Object.keys(value.assets)[0],
    original = await pixels(page),
    url = page.url();
  value.assets[id].w = 1;
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'invalid.pixelforge',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await expect(
    page.getByText('Invalid project assets', { exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await pixels(page)).toBe(original);
});

test('paint stays on its own raster layer and nondestructive filters retain source assets', async ({
  page,
}) => {
  const before = await pixels(page);
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await page.getByTestId('editor-canvas').click();
  await saved(page);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await saved(page);
  expect(await pixels(page)).toBe(before);
  await page.getByLabel('Visible', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Select layer Background', exact: true })
    .click();
  await page.getByRole('button', { name: 'Mono filter', exact: true }).click();
  const out = await project(page),
    f = out.value.history[out.value.index];
  expect(f.layers[0].adjustments.filter).toBe('grayscale(1) contrast(1.12)');
  expect(f.layers[1].kind).toBe('raster');
  await page
    .getByRole('button', { name: 'Original filter', exact: true })
    .click();
  await page.getByRole('button', { name: /^Select layer Paint/ }).click();
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await saved(page);
  expect(await pixels(page)).toBe(before);
});
