import { selectTool } from './tool-selection';
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
  };
};

const newPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

const canvasPoint = async (page: Page, fraction = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * fraction, clientY: box.y + box.height * 0.5 };
};

const stroke = async (page: Page) => {
  const start = await canvasPoint(page, 0.45), end = await canvasPoint(page, 0.58);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 87, pointerType: 'mouse', pressure: 1, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId: 87, pointerType: 'mouse', pressure: 1, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 87, pointerType: 'mouse', pressure: 1, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Mixer Brush exposes bounded wet/load/mix controls, commits one undo step and reloads settings', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Mixer Brush');
  await expect(page.getByLabel('Wet', { exact: true })).toBeVisible();
  await page.getByLabel('Wet', { exact: true }).fill('72');
  await page.getByLabel('Load', { exact: true }).fill('64');
  await page.getByLabel('Mix', { exact: true }).fill('81');
  await page.getByLabel('Flow', { exact: true }).fill('55');
  const before = await project(page);
  await stroke(page);
  const after = await project(page);
  expect(after.history.length).toBeGreaterThan(before.history.length);
  expect(after.settings.tool).toBe('mixer-brush');
  expect(after.settings.mixerBrush).toMatchObject({ wet: 72, load: 64, mix: 81, flow: 55 });
  await page.reload();
  await selectTool(page, 'Mixer Brush');
  await expect(page.getByLabel('Wet', { exact: true })).toHaveValue('72');
  await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('81');
});

test('History Brush selects a local source snapshot, restores through a stroke, and persists across reload', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Fill');
  await page.getByLabel('Drawing color', { exact: true }).fill('#d52b2b');
  const first = await canvasPoint(page);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 90, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Drawing color', { exact: true }).fill('#2355d5');
  await canvas.dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await selectTool(page, 'History Brush');
  await expect(page.getByLabel('History source', { exact: true })).toBeVisible();
  await page.getByLabel('History source', { exact: true }).selectOption('1');
  await page.getByLabel('History opacity', { exact: true }).fill('68');
  await page.getByLabel('History flow', { exact: true }).fill('74');
  const before = await project(page);
  await stroke(page);
  const restored = await project(page);
  expect(restored.history.length).toBeGreaterThan(before.history.length);
  expect(restored.settings.tool).toBe('history-brush');
  expect(restored.settings.historySourceIndex).toBe(1);
  expect(restored.settings.historyBrush).toMatchObject({ opacity: 68, flow: 74 });
  await page.reload();
  await selectTool(page, 'History Brush');
  await expect(page.getByLabel('History source', { exact: true })).toHaveValue('1');
});

test('B and Y keyboard shortcuts activate Mixer and History Brush families without changing the draft', async ({ page }) => {
  await newPaintLayer(page);
  const before = await project(page);
  await selectTool(page, 'Brush');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: /Mixer Brush tool/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'History Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
});
