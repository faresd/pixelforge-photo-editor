import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

/**
 * Capture a small, repeatable Chromium baseline for the local-first editor.
 *
 * This is deliberately a measurement test rather than a claim of a fixed
 * device budget: CI hardware varies. The generous watchdogs catch hangs while
 * the attached JSON gives release reviews actual startup/stroke/export data.
 */
test('records startup, raster stroke and PNG export timings', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    performance.mark('pixelforge-perf-start');
  });
  await page.goto('/editor?new=1', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');

  const startupMs = await page.evaluate(() => {
    performance.mark('pixelforge-editor-ready');
    return performance.measure(
      'pixelforge-editor-ready',
      'pixelforge-perf-start',
      'pixelforge-editor-ready',
    ).duration;
  });

  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.evaluate(() => performance.mark('pixelforge-stroke-start'));
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.45);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(
      box.x + box.width * (0.2 + i * 0.05),
      box.y + box.height * (0.45 + Math.sin(i / 2) * 0.06),
    );
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const strokeMs = await page.evaluate(() => {
    performance.mark('pixelforge-stroke-end');
    return performance.measure(
      'pixelforge-stroke',
      'pixelforge-stroke-start',
      'pixelforge-stroke-end',
    ).duration;
  });

  const exportMs = await page.evaluate(() => {
    performance.mark('pixelforge-export-start');
    document.querySelector<HTMLCanvasElement>('[data-testid="editor-canvas"]')!.toDataURL('image/png');
    performance.mark('pixelforge-export-end');
    return performance.measure(
      'pixelforge-export',
      'pixelforge-export-start',
      'pixelforge-export-end',
    ).duration;
  });
  const metrics = await page.evaluate(() => {
    const target = document.querySelector<HTMLCanvasElement>('[data-testid="editor-canvas"]')!;
    return {
      browser: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      canvas: { width: target.width, height: target.height },
    };
  });
  const report = { startupMs, strokeMs, exportMs, ...metrics };
  await testInfo.attach('performance-baseline.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(`PixelForge performance baseline ${JSON.stringify(report)}`);

  // Watchdogs prevent a hung browser from looking like a successful sample;
  // release targets are documented separately and should be calibrated per device.
  expect(startupMs).toBeLessThan(30_000);
  expect(strokeMs).toBeLessThan(30_000);
  expect(exportMs).toBeLessThan(30_000);
});
