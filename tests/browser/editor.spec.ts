import { test, expect } from '@playwright/test';

test('menus, transformations, undo and PNG export work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('application', { name: 'PixelForge photo editor' })).toBeVisible();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await expect(page.getByLabel('Document name')).toHaveValue('untitled-transparent');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1200');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '800');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1200');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('untitled-transparent.png');
  expect(await download.failure()).toBeNull();
  expect(errors).toEqual([]);
});

test('imports a local image and exposes text controls', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByTestId('file-input').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByLabel('Document name')).toHaveValue('sample');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
  await page.getByRole('button', { name: 'Text tool', exact: true }).click();
  await expect(page.getByLabel('Text content')).toBeVisible();
});

test('anonymous draft survives reload and bookmark; discard returns home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Document name').fill('Recovery test');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '960');
  await expect(page.getByRole('status')).toHaveText('Saved on this device');
  const bookmark = page.url();
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByRole('status')).toHaveText('Saved on this device');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  expect(page.url()).not.toBe(bookmark);
  await expect(page.getByRole('status')).toHaveText('Saved on this device');
  await page.goto(bookmark);
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  await expect(page.getByRole('status')).toHaveText('Saved on this device');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Start editing' })).toBeVisible();
  await page.goto(bookmark);
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Document name')).not.toHaveValue('Recovery test');
});

test('blocked local storage never reports a successful save', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage blocked'); } }); });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status')).toHaveText('Local save failed — export a copy');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});
