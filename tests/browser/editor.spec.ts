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
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('untitled-transparent.png');
  expect(await download.failure()).toBeNull();
  expect(errors).toEqual([]);
});

test('PNG JPEG and WebP exports report bytes, quality and persist preferences', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const readSignature = async (format: 'png' | 'jpeg' | 'webp') => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Export format').selectOption(format);
    if (format === 'jpeg') await expect(page.getByText('Transparent areas become white.', { exact: false })).toBeVisible();
    const bytes = page.getByLabel('Encoded file size');
    await expect(bytes).toHaveAttribute('data-bytes', /\d+/);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image', exact: true }).click();
    const path = await (await pending).path();
    const buffer = await (await import('node:fs/promises')).readFile(path!);
    const encodedBytes = Number(await bytes.getAttribute('data-bytes'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return { buffer, bytes: encodedBytes };
  };
  const png = await readSignature('png');
  expect(png.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const jpeg = await readSignature('jpeg');
  expect(jpeg.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('webp');
  await page.getByLabel('Export quality').fill('20');
  const webpBytes = page.getByLabel('Encoded file size');
  await expect(webpBytes).toHaveAttribute('data-bytes', /\d+/);
  const low = Number(await webpBytes.getAttribute('data-bytes'));
  await page.getByLabel('Export quality').fill('95');
  await expect(webpBytes).toHaveAttribute('data-bytes', /\d+/);
  const high = Number(await webpBytes.getAttribute('data-bytes'));
  expect(high).not.toBe(low);
  await expect(page.getByText('WebP uses lossy color compression and preserves transparency.', { exact: false })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const webpPath = await (await pending).path();
  const webp = await (await import('node:fs/promises')).readFile(webpPath!);
  expect(webp.subarray(0, 4).toString()).toBe('RIFF');
  expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export format')).toHaveValue('webp');
  await expect(page.getByLabel('Export quality')).toHaveValue('95');
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute('data-bytes', /\d+/);
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
  let rejectUpdate = false;
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('action') === 'session') return route.fulfill({ json: { authenticated: true, user: member } });
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData()!);
      if (rejectUpdate && body.generation !== '0') return route.fulfill({ status: 409, json: { error: 'This project changed elsewhere. Save a separate copy.' } });
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
  const oldId = saved!.id;
  rejectUpdate = true;
  await page.getByRole('button', { name: 'Update cloud project' }).click();
  await expect(page.getByText('This project changed elsewhere. Save a separate copy.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Document name')).toHaveValue('My private art continued');
  await page.getByRole('button', { name: 'Save as new cloud project' }).click();
  await expect(page.getByText('Cloud copy saved.', { exact: false })).toBeVisible();
  expect(saves).toBe(3);
  expect(saved!.id).not.toBe(oldId);
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

test('Photoshop-style tool, color and selection shortcuts are implemented', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');

  const active = (label: string) => page.getByRole('button', { name: `${label} tool`, exact: true });
  await page.keyboard.press('g');
  await expect(active('Gradient')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('g');
  await expect(active('Fill')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Brush')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Pencil')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(active('Color Replace')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('u');
  await expect(active('Shape')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('u');
  await expect(active('Ellipse')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Select')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Elliptical marquee')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Single Row marquee')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(active('Single Column marquee')).toHaveAttribute('aria-pressed', 'true');
  const zoom = page.getByLabel('Zoom', { exact: true });
  await expect(zoom).toHaveValue('72');
  await page.keyboard.press('+');
  await expect(zoom).toHaveValue('82');
  await page.keyboard.press('1');
  await expect(zoom).toHaveValue('100');
  await page.keyboard.press('0');
  await expect(zoom).toHaveValue('72');

  const setColorInput = async (label: string, value: string) =>
    page.getByLabel(label).evaluate((input, next) => {
      const element = input as HTMLInputElement;
      // oxlint-disable-next-line typescript/unbound-method
      Reflect.apply(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!, element, [next]);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  await setColorInput('Drawing color', '#123456');
  await setColorInput('Background color', '#abcdef');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#123456');
  await page.keyboard.press('x');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#abcdef');
  await expect(page.getByLabel('Background color')).toHaveValue('#123456');
  await page.keyboard.press('d');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#000000');
  await expect(page.getByLabel('Background color')).toHaveValue('#ffffff');

  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+a');
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeEnabled();
  await page.keyboard.press('Control+i');
  const selectionProject = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const selectionPath = await (await selectionProject).path();
  const selectionDraft = JSON.parse(await (await import('node:fs/promises')).readFile(selectionPath!, 'utf8')) as {
    history: Array<{ selection?: { inverted?: boolean } }>;
    index: number;
  };
  expect(selectionDraft.history[selectionDraft.index].selection?.inverted).toBe(true);
  await page.keyboard.press('Control+Shift+i');
  const shiftedSelectionProject = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const shiftedSelectionPath = await (await shiftedSelectionProject).path();
  const shiftedSelectionDraft = JSON.parse(await (await import('node:fs/promises')).readFile(shiftedSelectionPath!, 'utf8')) as {
    history: Array<{ selection?: { inverted?: boolean } }>;
    index: number;
  };
  expect(shiftedSelectionDraft.history[shiftedSelectionDraft.index].selection?.inverted).toBe(false);
  await page.keyboard.press('Control+d');
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+Shift+a');
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Drawing color')).toHaveValue('#000000');
  await expect(page.getByLabel('Background color')).toHaveValue('#ffffff');
});

test('Photoshop menu families expose working commands and label planned actions', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  for (const menu of ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Plugins']) {
    await page.getByRole('button', { name: menu, exact: true }).click();
    await expect(page.getByRole('menu', { name: `${menu} menu` })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Copy Layer/ })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: /^Fill/ })).toBeEnabled();
  const generativeFill = page.getByRole('menuitem', { name: /^Generative Fill/ });
  await expect(generativeFill).toBeDisabled();
  await expect(generativeFill).toHaveAttribute('title', 'Planned for a later roadmap stage');
  await expect(page.getByRole('menuitem', { name: /^Cut Layer/ })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: /^Paste Layer/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Merge Visible', exact: true })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: 'Flatten Image', exact: true })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: 'Layer Mask', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Gaussian Blur/ })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Vivid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vivid filter', exact: true })).toHaveClass(/selected/);
});

test('Edit Fill is undoable and menu selection commands persist', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data))).toEqual([255, 92, 53, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => item.getContext('2d')!.getImageData(12, 12, 1, 1).data[3])).toBe(0);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^All Ctrl\+A$/ }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await downloaded).path();
  const project = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'));
  expect(project.history[project.index].selection).toMatchObject({ shape: 'rectangle', w: 1200, h: 800 });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Deselect Ctrl\+D$/ }).click();
  await expect(page.getByRole('button', { name: 'Mask from selection', exact: true })).toBeDisabled();
});

test('Edit Clear, Shift-F5 fill and Merge Visible preserve pixels and hidden layers', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data))).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Shift+F5');
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data))).toEqual([255, 92, 53, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clear', exact: true }).click();
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => item.getContext('2d')!.getImageData(12, 12, 1, 1).data[3])).toBe(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => canvas.evaluate((item: HTMLCanvasElement) => Array.from(item.getContext('2d')!.getImageData(12, 12, 1, 1).data))).toEqual([255, 92, 53, 255]);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Duplicate Layer/ }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Hide Layers/ }).click();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Merge Visible', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText('2 /');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await downloaded).path();
  const project = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'));
  expect(project.history[project.index].layers).toHaveLength(2);
  expect(project.history[project.index].layers.filter((layer: { visible: boolean }) => !layer.visible)).toHaveLength(1);
});

test('layer menu copy, paste, hide and flatten preserve an undoable project', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Text Tool/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Copy Layer/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Paste Layer/ }).click();
  let downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  let path = await (await downloaded).path();
  let project = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'));
  expect(project.history[project.index].layers).toHaveLength(3);

  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Hide Layers/ }).click();
  await expect(page.getByLabel('Visible', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Flatten Image', exact: true }).click();
  await expect.poll(() => page.getByRole('heading', { name: /Layers/ }).textContent()).toContain('1 /');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  path = await (await downloaded).path();
  project = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'));
  expect(project.history[project.index].layers.length).toBe(3);
});

test('Photoshop-style document shortcuts drive existing actions and ignore text fields', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Control+g');
  await expect(page.getByRole('button', { name: /Collapse group Group 1/ })).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(page.getByText('Layers 2 / 32', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+g');
  await expect(page.getByRole('button', { name: /Collapse group Group 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '960');
  await page.keyboard.press('Control+Alt+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '960');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'File menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File menu' })).toBeHidden();

  await page.keyboard.press('Control+Alt+i');
  await expect(page.getByRole('heading', { name: 'Resize image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const projectDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+s');
  const download = await projectDownload;
  expect(download.suggestedFilename()).toMatch(/\.pixelforge$/);

  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Document name').fill('Typing guard');
  await page.getByLabel('Document name').press('g');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
