import { test, expect } from '@playwright/test';
import * as tools from '../../src/cropTools.ts';

const prepare = async (page: import('@playwright/test').Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

test.beforeEach(async ({ page }) => prepare(page));

test('perspective crop and frame contracts run in the browser and survive JSON round trips', async ({ page }) => {
  await expect(page.getByRole('application')).toBeVisible();
  const result = (() => {
    const quad: tools.CropQuad = [
      { x: 4, y: 8 },
      { x: 96, y: 2 },
      { x: 90, y: 72 },
      { x: 8, y: 76 },
    ];
    const crop = tools.planPerspectiveCrop(100, 80, { quad, width: 92, height: 70 });
    const restored = JSON.parse(JSON.stringify(crop));
    const mapped = tools.mapPerspectivePoint(crop.sourceFromOutput, { x: 46, y: 35 });
    const frame = tools.planFramePlacement({ x: 5, y: 7, width: 60, height: 40, sourceWidth: 120, sourceHeight: 80, fit: 'cover' });
    return {
      dimensions: [restored.width, restored.height],
      corners: restored.quad.length,
      mappedFinite: Number.isFinite(mapped.x) && Number.isFinite(mapped.y),
      frameMatrix: frame.matrix,
    };
  })();
  expect(result).toEqual({ dimensions: [92, 70], corners: 4, mappedFinite: true, frameMatrix: [0.5, 0, 0, 0.5, 5, 7] });
});

test('slice extraction is deterministic in a browser and leaves source bytes intact', async ({ page }) => {
  await expect(page.getByRole('application')).toBeVisible();
  const result = (() => {
    const source = new Uint8ClampedArray(3 * 2 * 4);
    for (let y = 0; y < 2; y += 1)
      for (let x = 0; x < 3; x += 1) source.set([x + 10, y + 20, 255, 255], (y * 3 + x) * 4);
    const before = Array.from(source);
    const plan = tools.planSlices(3, 2, [{ id: 'top', name: 'Top/row', x: 0, y: 0, width: 3, height: 1 }]);
    const [slice] = tools.extractSlices(source, 3, 2, plan);
    return { name: slice.name, dimensions: [slice.width, slice.height], bytes: Array.from(slice.pixels), unchanged: JSON.stringify(Array.from(source)) === JSON.stringify(before) };
  })();
  expect(result).toEqual({ name: 'Top-row', dimensions: [3, 1], bytes: [10, 20, 255, 255, 11, 20, 255, 255, 12, 20, 255, 255], unchanged: true });
});
