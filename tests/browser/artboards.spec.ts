import { test, expect, type Page } from '@playwright/test';

type Project = {
  history: Array<{
    w: number;
    h: number;
    artboards?: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      w: number;
      h: number;
      visible: boolean;
      locked: boolean;
      background?: string;
    }>;
    activeArtboardId?: string;
  }>;
  index: number;
};

const saved = async (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const downloadProject = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')) as Project;
};

const uploadProject = async (page: Page, value: Project) => {
  await page.getByTestId('project-input').setInputFiles({
    name: 'named-artboards.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

test('named artboard metadata imports, displays identity and round-trips through project persistence', async ({ page }) => {
  const project = await downloadProject(page);
  const frame = project.history[project.index];
  frame.artboards = [
    { id: 'hero', name: 'Hero', x: 0, y: 0, w: 640, h: 480, visible: true, locked: false, background: '#ffffff' },
    { id: 'social', name: 'Social', x: 660, y: 0, w: 640, h: 480, visible: true, locked: false, background: '#101820' },
  ];
  frame.activeArtboardId = 'social';
  await uploadProject(page, project);
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '2');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'social');
  const roundTrip = await downloadProject(page);
  expect(roundTrip.history[roundTrip.index].artboards).toEqual(frame.artboards);
  expect(roundTrip.history[roundTrip.index].activeArtboardId).toBe('social');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '2');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-active-artboard', 'social');
});

test('malformed or out-of-bounds artboards are rejected without replacing the current draft', async ({ page }) => {
  const original = await downloadProject(page);
  const corrupt = structuredClone(original);
  const frame = corrupt.history[corrupt.index];
  frame.artboards = [
    { id: 'bad', name: 'Bad', x: frame.w - 2, y: 0, w: 8, h: 8, visible: true, locked: false },
  ];
  await uploadProject(page, corrupt);
  await expect(page.locator('footer')).toContainText('Invalid layer document');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-artboard-count', '0');
  expect((await downloadProject(page)).history[0].artboards).toBeUndefined();
});
