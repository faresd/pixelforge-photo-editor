import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('publishes render, paint, local-save and export operation marks', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');

  const canvas = page.getByTestId('editor-canvas');
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Encoded file size')).toContainText('bytes', {
    timeout: 10_000,
  });

  const marks = await page.evaluate(() => ({
    render: performance.getEntriesByName('pixelforge.render').length,
    paint: performance.getEntriesByName('pixelforge.paint').length,
    save: performance.getEntriesByName('pixelforge.save').length,
    export: performance.getEntriesByName('pixelforge.export').length,
    stable: ['render', 'paint', 'save', 'export'].every((name) =>
      performance.getEntriesByName(`pixelforge.${name}.latest`).length > 0,
    ),
  }));
  expect(marks.render).toBeGreaterThan(0);
  expect(marks.paint).toBeGreaterThan(0);
  expect(marks.save).toBeGreaterThan(0);
  expect(marks.export).toBeGreaterThan(0);
  expect(marks.stable).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});
