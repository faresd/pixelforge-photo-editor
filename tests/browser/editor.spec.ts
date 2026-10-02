import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', route => route.fulfill({ json: { authenticated: false } }));
});

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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  const bookmark = page.url();
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Start editing' }).click();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  expect(page.url()).not.toBe(bookmark);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.goto(bookmark);
  await expect(page.getByLabel('Document name')).toHaveValue('Recovery test');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Local save failed — export a copy');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});

test('signed-in users save, revisit and continue cloud projects without automatic uploads', async ({ page }) => {
  const member = { id: 'a6135ab2-0c9f-4f07-a78d-86648d6fb10a', name: 'Test member' };
  let saved: { id: string; generation: string; document: unknown } | undefined;
  let saves = 0;
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('action') === 'session') return route.fulfill({ json: { authenticated: true, user: member } });
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData()!);
      saves++;
      saved = { id: body.id, generation: String(saves), document: body.document };
      return route.fulfill({ json: { id: saved.id, generation: saved.generation } });
    }
    if (url.searchParams.has('id')) return route.fulfill({ json: saved });
    return route.fulfill({ json: { projects: saved ? [{ id: saved.id, name: 'My private art', generation: saved.generation, updatedAt: '2026-10-02T12:00:00Z', bytes: 1000 }] : [] } });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Document name').fill('My private art');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Save to my projects' }).click();
  await expect(page.getByText('Cloud copy saved.', { exact: false })).toBeVisible();
  expect(saves).toBe(1);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.getByRole('link', { name: 'View my projects' }).click();
  await expect(page.getByRole('heading', { name: 'My projects' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByLabel('Document name')).toHaveValue('My private art');
  await page.getByLabel('Document name').fill('My private art continued');
  await page.getByRole('button', { name: 'Update cloud project' }).click();
  await expect(page.getByText('Cloud copy saved.', { exact: false })).toBeVisible();
  expect(saves).toBe(2);
});

test('exact resizing and project file round-trip retain pixels, dimensions and undo', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Document name').fill('Portable project');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…' }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('720');
  await expect(page.getByLabel('Height (px)', { exact: true })).toHaveValue('480');
  await page.getByRole('button', { name: 'Apply resize' }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Portable project.pixelforge');
  const path = await download.path();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByTestId('project-input').setInputFiles(path!);
  await expect(page.getByLabel('Document name')).toHaveValue('Portable project');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '720');
  expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pixels);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
});

test('flipping transparent artwork does not leave duplicate opaque pixels', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const fixture = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 1; const context = canvas.getContext('2d')!; context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1, 1); return canvas.toDataURL().split(',')[1]; });
  await page.getByTestId('file-input').setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '2');
  await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(0, 0, 2, 1).data));
  expect(pixels).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
});
