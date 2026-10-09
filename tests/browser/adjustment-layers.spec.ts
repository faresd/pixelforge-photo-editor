import { test, expect, type Page } from '@playwright/test';

type Project = {
  history: Array<{
    layers: Array<{
      kind?: string;
      asset?: string;
      adjustments?: { levelsBlack?: number; levelsWhite?: number };
    }>;
  }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')) as Project;
}

async function importFixture(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 40;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const value = x < canvas.width / 2 ? [32, 64, 96, 255] : [192, 160, 128, 255];
        image.data.set(value, (y * canvas.width + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'adjustment-layer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '80');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '40');
}

async function pixels(page: Page) {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  return canvas.evaluate((element: HTMLCanvasElement) => [
    Array.from(element.getContext('2d')!.getImageData(10, 20, 1, 1).data),
    Array.from(element.getContext('2d')!.getImageData(70, 20, 1, 1).data),
  ]);
}

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
}

test('adjustment layer corrects composite below without copying source pixels', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const source = before.history[before.index].layers.at(-1)!.asset!;
  const baseline = await pixels(page);

  await page.getByRole('button', { name: 'Add adjustment layer', exact: true }).click();
  await page.getByLabel('Levels black point', { exact: true }).fill('120');
  await expect.poll(() => pixels(page)).not.toEqual(baseline);
  const adjusted = await project(page);
  const layers = adjusted.history[adjusted.index].layers;
  expect(layers.at(-1)?.kind).toBe('adjustment');
  expect(layers.at(-1)?.adjustments?.levelsBlack).toBe(120);
  expect(layers.at(-2)?.asset).toBe(source);
  expect(adjusted.assets[source]).toEqual(before.assets[source]);

  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => pixels(page)).not.toEqual(baseline);
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)?.kind).toBe('adjustment');
  expect(restored.history[restored.index].layers.at(-1)?.adjustments?.levelsBlack).toBe(120);
});

test('adjustment layer undo restores the original composite while preserving the node source', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const baseline = await pixels(page);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Adjustment Layer', exact: true }).click();
  await page.getByLabel('Hue', { exact: true }).fill('90');
  await expect.poll(() => pixels(page)).not.toEqual(baseline);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixels(page)).toEqual(baseline);
  const restored = await project(page);
  expect(restored.history[restored.index].layers).toHaveLength(before.history[before.index].layers.length);
});
