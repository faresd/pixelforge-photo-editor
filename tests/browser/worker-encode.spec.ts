import { test, expect } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('batch export uses the OffscreenCanvas worker path when the browser supports it', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const supported = await page.evaluate(() =>
    typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof ImageData === 'function',
  );
  test.skip(!supported, 'OffscreenCanvas worker is unavailable in this browser');
  await page.evaluate(() => {
    (window as Window & { __pixelForgeWorkerCount?: number }).__pixelForgeWorkerCount = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        const state = window as Window & { __pixelForgeWorkerCount?: number };
        state.__pixelForgeWorkerCount = (state.__pixelForgeWorkerCount || 0) + 1;
      }
    } as typeof Worker;
  });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'worker.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
  ]);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/1 images/);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __pixelForgeWorkerCount?: number }).__pixelForgeWorkerCount || 0,
  )).toBeGreaterThan(0);
});

const MULTI_TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAgEAAAABCAYAAABHeX1IAAAAG0lEQVR4nGNQaDjxfxSP4lE8ikfxKB7FIw8DAOf50KQXqCgmAAAAAElFTkSuQmCC',
  'base64',
);

test('worker export accepts a source spanning multiple bounded tile reads', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as Window & { __pixelForgeWorkerCount?: number }).__pixelForgeWorkerCount = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        const state = window as Window & { __pixelForgeWorkerCount?: number };
        state.__pixelForgeWorkerCount = (state.__pixelForgeWorkerCount || 0) + 1;
      }
    } as typeof Worker;
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const supported = await page.evaluate(() =>
    typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof ImageData === 'function',
  );
  test.skip(!supported, 'OffscreenCanvas worker is unavailable in this browser');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'wide.png', mimeType: 'image/png', buffer: MULTI_TILE_PNG },
  ]);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/1 images/);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __pixelForgeWorkerCount?: number }).__pixelForgeWorkerCount || 0,
  )).toBeGreaterThan(0);
  expect(await page.getByRole('button', { name: 'Download batch ZIP' }).isVisible()).toBe(true);
});
