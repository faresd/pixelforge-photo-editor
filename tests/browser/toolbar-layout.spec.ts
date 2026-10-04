import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('tool palette uses two columns while preserving every accessible tool', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const palette = page.getByTestId('tool-palette');
  await expect(palette).toBeVisible();
  const layout = await palette.evaluate((element) => {
    const styles = getComputedStyle(element);
    const buttons = [...element.querySelectorAll('button')];
    return {
      display: styles.display,
      columns: styles.gridTemplateColumns.split(' ').length,
      labels: buttons.map((button) => button.getAttribute('aria-label')),
      columnOffsets: [...new Set(buttons.map((button) => button.offsetLeft))],
      touchTargets: buttons.every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
    };
  });
  expect(layout.display).toBe('grid');
  expect(layout.columns).toBe(2);
  expect(layout.columnOffsets.length).toBe(2);
  expect(layout.touchTargets).toBe(true);
  expect(layout.labels).toContain('Move tool');
  expect(layout.labels).toContain('Magic Wand tool');
  expect(layout.labels).toContain('Quick Mask mode');
});

test('wide editor palette expands to three columns without losing keyboard targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const palette = page.getByTestId('tool-palette');
  const layout = await palette.evaluate((element) => {
    const styles = getComputedStyle(element);
    const buttons = [...element.querySelectorAll('button')];
    return {
      columns: styles.gridTemplateColumns.split(' ').length,
      columnOffsets: [...new Set(buttons.map((button) => button.offsetLeft))],
    };
  });
  expect(layout.columns).toBe(3);
  expect(layout.columnOffsets.length).toBe(3);
  const pen = page.getByRole('button', { name: 'Pen tool', exact: true });
  await pen.focus();
  await expect(pen).toBeFocused();
  await expect(pen).toHaveAttribute('title', 'Pen (P)');
});

test('press-and-hold opens a Photoshop-style subtool flyout and touch can switch tools', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const crop = page.getByRole('button', { name: 'Crop tool', exact: true });
  await crop.hover();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  const flyout = page.getByRole('menu', { name: 'Crop subtools', exact: true });
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('menuitem', { name: 'Perspective Crop', exact: true })).toBeVisible();
  await flyout.getByRole('menuitem', { name: 'Perspective Crop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Perspective Crop tool', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Keyboard opening has the same accessible menu contract and exposes the
  // Photoshop M/L/W selection groups with friendly aliases.
  const marquee = page.getByRole('button', { name: 'Select tool', exact: true });
  await marquee.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'Select subtools', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Rectangular Marquee', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Select subtools', exact: true })).toHaveCount(0);

  const lasso = page.getByRole('button', { name: 'Lasso tool', exact: true });
  await lasso.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Freeform Lasso', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const selectionBrush = page.getByRole('button', { name: 'Selection Brush tool', exact: true });
  await selectionBrush.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'Selection Brush subtools', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Quick Selection', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Magic Wand', exact: true })).toBeVisible();
});
