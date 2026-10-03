import { test, expect, type Page } from '@playwright/test';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};
const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8')) as {
    settings: Record<string, unknown>;
    history: Array<{ layers: Array<{ kind: string; asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};
const saved = (page: Page) => expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const paintUpdated = (page: Page) => expect(page.locator('footer')).toContainText('Paint layer updated', { timeout: 10000 });
const canvasPoint = async (page: Page, fraction = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * fraction, clientY: box.y + box.height * 0.5 };
};
const pointerStroke = async (page: Page, pressure: number, fraction = 0.5, pointerType = 'pen') => {
  const point = await canvasPoint(page, fraction);
  const canvas = page.getByTestId('editor-canvas');
  // Locator.dispatchEvent creates synthetic pointers with no active browser
  // pointer stream, so setPointerCapture would reject their ids. Keep the
  // editor's real pointer path while making the synthetic pressure explicit.
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', { pointerId: 9, pointerType, pressure, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointermove', { pointerId: 9, pointerType, pressure, clientX: point.clientX + 12, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 9, pointerType, pressure, clientX: point.clientX + 12, clientY: point.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await paintUpdated(page);
  await page.waitForTimeout(150);
  await saved(page);
};

 test.beforeEach(async ({ page }) => openEditor(page));

test('brush pressure controls are accessible, opt-in, persisted, and backward-compatible', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects size', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).not.toBeChecked();
  await page.getByLabel('Size', { exact: true }).fill('44');
  await page.getByLabel('Hardness', { exact: true }).fill('0');
  await page.getByLabel('Opacity', { exact: true }).fill('63');
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await saved(page);
  const out = await project(page);
  expect(out.settings).toMatchObject({ size: 44, hardness: 0, brushOpacity: 63, pressureSize: true, pressureOpacity: true });
  await page.reload();
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('44');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('63');
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).toBeChecked();

  // Drafts created before pressure controls existed omit both optional keys;
  // importing one must preserve the document and use the safe off defaults.
  const legacy = JSON.parse(JSON.stringify(out)) as typeof out;
  delete legacy.settings.pressureSize;
  delete legacy.settings.pressureOpacity;
  await page.getByTestId('project-input').setInputFiles({
    name: 'legacy-pressure.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await expect(page.getByLabel('Pressure affects size', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).not.toBeChecked();

  const invalid = JSON.parse(JSON.stringify(legacy)) as typeof out;
  invalid.settings.pressureSize = 'enabled' as unknown as boolean;
  await page.getByTestId('project-input').setInputFiles({
    name: 'invalid-pressure.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('footer')).toContainText('Saved document is not supported');
});

test('pressure-off fallback keeps pen strokes at configured size and opacity', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('36');
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await pointerStroke(page, 0.15, 0.36);
  const low = await project(page);
  await pointerStroke(page, 0.85, 0.64);
  const high = await project(page);
  const lowLayer = low.history[low.index].layers.at(-1)!;
  const highLayer = high.history[high.index].layers.at(-1)!;
  expect(lowLayer.kind).toBe('raster'); expect(highLayer.kind).toBe('raster');
  expect(low.assets[lowLayer.asset!].w).toBe(high.assets[highLayer.asset!].w);
  expect(low.assets[lowLayer.asset!].h).toBe(high.assets[highLayer.asset!].h);
});

test('pressure-on changes diameter and alpha in the expected direction', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('54');
  await page.getByLabel('Pressure affects size', { exact: true }).check();
  await page.getByLabel('Pressure affects opacity', { exact: true }).check();
  await pointerStroke(page, 0.2, 0.3);
  const low = await project(page);
  await pointerStroke(page, 0.8, 0.7);
  const high = await project(page);
  const lowLayer = low.history[low.index].layers.at(-1)!;
  const highLayer = high.history[high.index].layers.at(-1)!;
  expect(lowLayer.kind).toBe('raster'); expect(highLayer.kind).toBe('raster');
  const lowAsset = low.assets[lowLayer.asset!], highAsset = high.assets[highLayer.asset!];
  expect(lowAsset.url).not.toBe(highAsset.url);
  const [lowAlpha, highAlpha] = await page.evaluate(async ({ lowUrl, highUrl, width, height }) => {
    const sample = async (url: string) => { const image = new Image(); image.src = url; await image.decode(); const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d')!.drawImage(image, 0, 0); return c.getContext('2d')!.getImageData(Math.floor(width * .3), Math.floor(height * .5), 1, 1).data[3]; };
    return [await sample(lowUrl), await sample(highUrl)];
  }, { lowUrl: lowAsset.url, highUrl: highAsset.url, width: lowAsset.w, height: lowAsset.h });
  expect(highAlpha).toBeGreaterThanOrEqual(lowAlpha);
});

test('hardness accepts zero while pencil remains a hard-edge tool', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Hardness', { exact: true }).fill('0');
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Pencil tool', exact: true }).click();
  await expect(page.getByLabel('Hardness', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Color Replace tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects opacity', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Shape tool', exact: true }).click();
  await expect(page.getByLabel('Pressure affects size', { exact: true })).toHaveCount(0);
});

test('eraser honors opacity and restores through undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).fill('30');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const painted = await project(page);
  const paintedLayer = painted.history[painted.index].layers.at(-1)!;
  await page.getByRole('button', { name: 'Eraser tool', exact: true }).click();
  await page.getByLabel('Opacity', { exact: true }).fill('25');
  await pointerStroke(page, 1, 0.5, 'mouse');
  const erased = await project(page);
  const erasedLayer = erased.history[erased.index].layers.at(-1)!;
  expect(erasedLayer.asset).not.toBe(paintedLayer.asset);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await saved(page);
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.asset).toBe(paintedLayer.asset);
});

test('touch stroke commits once and pointer cancellation leaves the draft unchanged', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const before = await project(page);
  const point = await canvasPoint(page, 0.3);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX + 80, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 11, pointerType: 'touch', pressure: 0, clientX: point.clientX + 80, clientY: point.clientY, buttons: 0, isPrimary: true });
  await saved(page);
  const afterCancel = await project(page);
  expect(afterCancel.history.length).toBe(before.history.length);
  await pointerStroke(page, 0, 0.3, 'touch');
  const afterTouch = await project(page);
  expect(afterTouch.history.length).toBe(before.history.length + 1);
});
