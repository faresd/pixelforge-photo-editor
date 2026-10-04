import { test, expect, type Page } from '@playwright/test';

type Project = {
  history: Array<{
    layers: Array<{
      asset?: string;
      adjustments?: {
        photoAdjustments?: {
          exposure: number;
          vibrance: number;
          blackAndWhite: boolean;
        };
      };
    }>;
  }>;
  index: number;
  assets: Record<string, unknown>;
};

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
});

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return JSON.parse(
    await (await import('node:fs/promises')).readFile(
      (await download.path())!,
      'utf8',
    ),
  ) as Project;
}

test('photo finishing controls are nondestructive, persisted and undoable', async ({
  page,
}) => {
  const before = await project(page);
  const sourceAsset = before.history[before.index].layers.at(-1)?.asset;
  await page.getByLabel('Exposure', { exact: true }).fill('1.5');
  await page.getByLabel('Vibrance', { exact: true }).fill('35');
  await page.getByLabel('Black and White', { exact: true }).check();

  let adjusted = await project(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments?.photoAdjustments).toEqual({
    exposure: 1.5,
    vibrance: 35,
    blackAndWhite: true,
  });
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  adjusted = await project(page);
  expect(adjusted.history[adjusted.index].layers.at(-1)?.adjustments?.photoAdjustments).toEqual({
    exposure: 0,
    vibrance: 0,
    blackAndWhite: false,
  });

  await page.getByLabel('Exposure', { exact: true }).fill('2');
  await page.getByLabel('Vibrance', { exact: true }).fill('-20');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  adjusted = await project(page);
  expect(adjusted.history[adjusted.index].layers.at(-1)?.adjustments?.photoAdjustments).toEqual({
    exposure: 2,
    vibrance: -20,
    blackAndWhite: false,
  });
});
