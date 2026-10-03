import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Array<{ kind: string; asset?: string }> }>;
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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8')) as Project;
};

const newPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

const canvasPoint = async (page: Page, x: number, y = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const stroke = async (page: Page, startX: number, endX: number, pointerType = 'mouse') => {
  const start = await canvasPoint(page, startX), end = await canvasPoint(page, endX);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const sample = async (page: Page, asset: Asset, points: Array<{ x: number; y?: number }>) =>
  page.evaluate(async ({ asset, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return points.map(({ x, y = 0.5 }) => {
      const px = Math.max(0, Math.min(asset.w - 1, Math.floor(asset.w * x)));
      const py = Math.max(0, Math.min(asset.h - 1, Math.floor(asset.h * y)));
      return Array.from(context.getImageData(px, py, 1, 1).data);
    });
  }, { asset, points });

test.beforeEach(async ({ page }) => openEditor(page));

test('O cycles Dodge, Burn and Sponge with persisted tonal options and project settings', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByRole('button', { name: 'Dodge tool', exact: true }).click();
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Burn tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Exposure', { exact: true }).fill('63');
  await page.getByLabel('Tonal range', { exact: true }).selectOption('highlights');
  await page.getByRole('button', { name: 'Burn tool', exact: true }).focus();
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Sponge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Sponge mode', { exact: true }).selectOption('desaturate');
  await page.getByLabel('Vibrance', { exact: true }).fill('77');
  const saved = await project(page);
  expect(saved.settings).toMatchObject({ tool: 'sponge', tonalExposure: 63, tonalRange: 'highlights', spongeMode: 'desaturate', spongeVibrance: 77 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sponge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Sponge mode', { exact: true })).toHaveValue('desaturate');
  await expect(page.getByLabel('Vibrance', { exact: true })).toHaveValue('77');
});

test('Dodge brightens and Burn darkens representative pixels with undo/redo and reload', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#808080');
  await page.getByRole('button', { name: 'Fill tool', exact: true }).click();
  const point = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 182, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const beforePixel = (await sample(page, before.assets[beforeLayer.asset!]!, [{ x: 0.5 }]))[0];
  await page.getByRole('button', { name: 'Dodge tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Exposure', { exact: true }).fill('40');
  await stroke(page, 0.5, 0.55);
  const dodged = await project(page);
  const dodgePixel = (await sample(page, dodged.assets[dodged.history[dodged.index].layers.at(-1)!.asset!]!, [{ x: 0.5 }]))[0];
  expect(dodgePixel[0]).toBeGreaterThan(beforePixel[0]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.locator('footer')).toContainText('Undo');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.locator('footer')).toContainText('Redo');
  await page.getByRole('button', { name: 'Burn tool', exact: true }).click();
  await stroke(page, 0.5, 0.55);
  const burned = await project(page);
  const burnPixel = (await sample(page, burned.assets[burned.history[burned.index].layers.at(-1)!.asset!]!, [{ x: 0.5 }]))[0];
  expect(burnPixel[0]).toBeLessThan(dodgePixel[0]);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history.length).toBe(burned.history.length);
});

test('tonal strokes honor locked layers and cancel touch gestures without committing', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#b04040');
  await page.getByRole('button', { name: 'Fill tool', exact: true }).click();
  const point = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 183, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Lock layer', { exact: true }).check();
  const lockedBefore = await project(page);
  await page.getByRole('button', { name: 'Dodge tool', exact: true }).click();
  await stroke(page, 0.5, 0.6, 'touch');
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  const locked = await project(page);
  expect(locked.history.length).toBe(lockedBefore.history.length);
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  const unlockedBeforeCancel = await project(page);
  const start = await canvasPoint(page, 0.3), end = await canvasPoint(page, 0.8);
  await canvas.dispatchEvent('pointerdown', { pointerId: 184, pointerType: 'touch', pressure: 0.6, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 184, pointerType: 'touch', pressure: 0.6, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 184, pointerType: 'touch', pressure: 0, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  const canceled = await project(page);
  expect(canceled.history.length).toBe(unlockedBeforeCancel.history.length);
});
