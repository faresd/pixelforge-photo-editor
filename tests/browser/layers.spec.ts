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
const pixels = async (page: Page) => {
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  return page
    .getByTestId('editor-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
};
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
  await page.getByTestId('project-input').setInputFiles({
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
  expect(await pixels(page)).not.toBe(before);
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

test('layer position, blending and visibility produce exact composite pixels', async ({
  page,
}) => {
  const fixtures = await page.evaluate(() => {
    const make = (color: string, w: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = 1;
      const x = c.getContext('2d')!;
      x.fillStyle = color;
      x.fillRect(0, 0, w, 1);
      return c.toDataURL().split(',')[1];
    };
    return { blue: make('#0000ff', 2), red: make('#ff0000', 1) };
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'blue.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixtures.blue, 'base64'),
  });
  await expect(page.getByLabel('Document name')).toHaveValue('blue');
  await page.getByTestId('layer-input').setInputFiles({
    name: 'red.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixtures.red, 'base64'),
  });
  await expect(page.getByLabel('Layer name', { exact: true })).toHaveValue(
    'red.png',
  );
  await page.getByLabel('Layer X', { exact: true }).fill('1');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  const read = () =>
    page
      .getByTestId('editor-canvas')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(0, 0, 2, 1).data),
      );
  await expect.poll(read).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  await page.getByLabel('Blend mode', { exact: true }).selectOption('multiply');
  await expect.poll(read).toEqual([0, 0, 255, 255, 0, 0, 0, 255]);
  await page.getByLabel('Visible', { exact: true }).uncheck();
  await expect.poll(read).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…' }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Apply resize' }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
});

test('vector shapes remain editable through property edits, rotation and undo', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Shape tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByLabel('Shape width', { exact: true })).toBeVisible();
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape width', { exact: true }).fill('300');
  await page.getByLabel('Shape width', { exact: true }).press('Enter');
  const first = await project(page),
    original = first.value.history[first.value.index].layers[1];
  expect(original.kind).toBe('rectangle');
  expect(original.width).toBe(300);
  expect(original.fill).toBe(true);
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(canvas).toHaveAttribute('width', '960');
  const rotated = await project(page);
  expect(rotated.value.history[rotated.value.index].layers[1].kind).toBe(
    'rectangle',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.value.history[undone.value.index].layers[1]).toEqual(original);
});

test('a stale tab cannot overwrite or discard newer work and can save its own local copy', async ({
  page,
  context,
}) => {
  const bookmark = page.url();
  const second = await context.newPage();
  await second.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await second.goto(bookmark);
  await expect(second.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await second.getByLabel('Document name').fill('Newer tab work');
  await saved(second);
  await page.getByLabel('Document name').fill('Older tab edits');
  await expect(page.getByRole('alert')).toHaveText(
    'This draft changed in another tab. Save a local copy to keep your edits.',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Could not discard the draft. Please try again.');
  await second.reload();
  await expect(second.getByLabel('Document name')).toHaveValue(
    'Newer tab work',
  );
  await saved(second);
  await page
    .getByRole('button', { name: 'Save local copy', exact: true })
    .click();
  await saved(page);
  expect(page.url()).not.toBe(bookmark);
  await page.reload();
  await expect(page.getByLabel('Document name')).toHaveValue('Older tab edits');
  await saved(page);
  await page.goto(bookmark);
  await expect(page.getByLabel('Document name')).toHaveValue('Newer tab work');
  await second.close();
});
