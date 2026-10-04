import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function importPixels(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(9, 5);
    for (let y = 0; y < 5; y += 1)
      for (let x = 0; x < 9; x += 1) {
        const offset = (y * 9 + x) * 4;
        data.data[offset] = x * 22;
        data.data[offset + 1] = y * 38;
        data.data[offset + 2] = (x + y) * 12;
        data.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
      }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'filter-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8')) as {
    assets: Record<string, unknown>;
    history: Array<{ layers: Array<{ asset?: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

async function openProject(page: Page, project: object) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'radial-roundtrip.pixelforge.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) =>
      Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );

test('Field Blur is a nondestructive menu effect with source-safe persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const fieldBlur = page.getByRole('menuitem', { name: 'Field Blur…', exact: true });
  await expect(fieldBlur).toBeEnabled();
  await fieldBlur.click();
  await expect(page.getByText('Field Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'field-blur' });
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('field-blur');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Box Blur and Gaussian Blur are editable, source-safe and alpha-preserving on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  for (const [menuLabel, type, notice] of [
    ['Box Blur…', 'box-blur', 'Box Blur applied; remains editable in Filter effects'],
    ['Gaussian Blur…', 'gaussian-blur', 'Gaussian Blur applied; remains editable in Filter effects'],
  ] as const) {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const command = page.getByRole('menuitem', { name: menuLabel, exact: true });
    await expect(command).toBeEnabled();
    await command.click();
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('6');
    await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
    await expect(page.getByLabel('Blur radius', { exact: true })).toHaveValue('7');
    await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
    expect((await pixel(page, 0, 0))[3]).toBe(0);

    const adjusted = await downloadProject(page);
    const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
    expect(adjustedLayer.asset).toBe(sourceAsset);
    expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
    expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
      type,
      amount: 85,
      radius: 7,
    });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
    await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  }
});

test('Motion Blur is directional, editable and source-safe on desktop and mobile', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Motion Blur…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Motion Blur…', exact: true }).click();
  await expect(page.getByText('Motion Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('motion-blur');
  await expect(page.getByLabel('Motion angle', { exact: true })).toHaveValue('0');
  await page.getByLabel('Motion angle', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Motion angle', { exact: true })).toHaveValue('1');
  await page.getByLabel('Blur radius', { exact: true }).press('ArrowRight');
  await expect.poll(() => pixel(page, 4, 0)).not.toEqual(sourcePixel);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'motion-blur',
    amount: 70,
    angle: 1,
  });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 4, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Radial Blur is a nondestructive spin effect with editable centre', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Radial Blur…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Radial Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Blur center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Angular sweep', { exact: true }).press('ArrowRight');
  await page.getByLabel('Blur center X', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('19');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('51');
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'radial-blur',
    amount: 70,
    radius: 19,
    centerX: 0.51,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Blur center X', { exact: true })).toHaveValue('51');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('radial-blur');
  await expect(page.getByLabel('Angular sweep', { exact: true })).toHaveValue('19');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Mosaic, Tilt-Shift, Ripple and Twirl commands expose editable effect metadata', async ({ page }) => {
  await importPixels(page);
  for (const [menuLabel, type] of [
    ['Mosaic…', 'mosaic'],
    ['Tilt-Shift…', 'tilt-shift'],
    ['Ripple…', 'ripple'],
    ['Twirl…', 'twirl'],
  ] as const) {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('menuitem', { name: menuLabel, exact: true }).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    const project = await downloadProject(page);
    expect(project.history[project.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({ type });
  }
});

test('Pinch is enabled as a nondestructive Distort effect with centred controls and round-trip persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 4, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Pinch…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('Pinch applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Pinch center Y', { exact: true })).toHaveValue('50');
  await page.getByLabel('Pinch center X', { exact: true }).press('ArrowRight');
  await page.getByLabel('Pinch radius', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('51');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('41');
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'pinch',
    amount: 70,
    radius: 41,
    centerX: 0.51,
  });

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch center X', { exact: true })).toHaveValue('51');
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('pinch');
  await expect(page.getByLabel('Pinch radius', { exact: true })).toHaveValue('41');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
  await expect.poll(() => pixel(page, 4, 2)).toEqual(sourcePixel);
});
