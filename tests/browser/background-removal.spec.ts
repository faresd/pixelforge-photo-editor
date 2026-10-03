import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{
    layers: Array<{ kind: string; asset?: string; mask?: string }>;
  }>;
  index: number;
  assets: Record<string, Asset>;
};

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const file = await (await pending).path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8')) as Project;
};

const fixture = [
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
];

const importFixture = async (page: Page) => {
  const encoded = await page.evaluate((values) => {
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(5, 5);
    values.flat().forEach((value, index) => { image.data[index] = value; });
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, fixture);
  await page.getByTestId('file-input').setInputFiles({
    name: 'background-removal-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const sampleAsset = async (page: Page, asset: Asset, points: Array<[number, number]>) =>
  page.evaluate(async ({ asset, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, { asset, points });

test.beforeEach(async ({ page }) => openEditor(page));

test('Remove Background creates a local nondestructive mask, preserves source pixels and survives reload', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  expect(beforeLayer.mask).toBeUndefined();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Remove Background…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });

  const after = await project(page);
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(afterLayer.asset).toBe(beforeLayer.asset);
  expect(afterLayer.mask).toBeTruthy();
  expect(after.assets[afterLayer.asset!]).toEqual(before.assets[beforeLayer.asset!]);
  const [edge, subject] = await sampleAsset(page, after.assets[afterLayer.mask!], [[0, 0], [2, 2]]);
  expect(edge[3]).toBe(0);
  expect(subject[3]).toBe(255);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.mask).toBeUndefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.mask).toBeTruthy();
});

test('Remove Background is disabled for locked layers and remains local', async ({ page }) => {
  await importFixture(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Remove Background…', exact: true })).toBeDisabled();
});
