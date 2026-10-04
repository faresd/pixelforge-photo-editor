import { test, expect } from '@playwright/test';

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
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
});

const canvasPoint = async (
  page: import('@playwright/test').Page,
  x: number,
  y: number,
) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

test('Red Eye exposes bounded local correction controls and commits one undoable edit', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Red Eye tool', exact: true }).click();
  await expect(page.getByLabel('Red threshold', { exact: true })).toHaveValue(
    '36',
  );
  await expect(
    page.getByLabel('Correction amount', { exact: true }),
  ).toHaveValue('100');
  await page.getByLabel('Red threshold', { exact: true }).fill('24');
  await page.getByLabel('Correction amount', { exact: true }).fill('72');
  const point = await canvasPoint(page, 0.78, 0.27);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'mouse',
    pressure: 1,
    ...point,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointerup', {
    pointerId: 91,
    pointerType: 'mouse',
    pressure: 1,
    ...point,
    buttons: 0,
    isPrimary: true,
  });
  await expect(page.locator('footer')).toContainText(
    'Red Eye correction applied',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.locator('footer')).toContainText('Undone');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Red Eye tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Red threshold', { exact: true })).toHaveValue(
    '24',
  );
  await expect(
    page.getByLabel('Correction amount', { exact: true }),
  ).toHaveValue('72');
});

test('Red Eye rejects locked layers without creating a raster edit', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Red Eye tool', exact: true }).click();
  await page.getByLabel('Lock layer', { exact: true }).check();
  const point = await canvasPoint(page, 0.78, 0.27);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 92,
    pointerType: 'touch',
    pressure: 1,
    ...point,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointerup', {
    pointerId: 92,
    pointerType: 'touch',
    pressure: 1,
    ...point,
    buttons: 0,
    isPrimary: true,
  });
  await expect(page.locator('footer')).toContainText(
    'Select a visible, unlocked raster layer before Red Eye correction',
  );
});
