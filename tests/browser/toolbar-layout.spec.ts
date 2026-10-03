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
