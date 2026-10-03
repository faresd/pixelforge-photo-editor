import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('keyboard focus stays visible on desktop and touch editor controls', async ({
  page,
}) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );

  // Move focus with the keyboard so Chromium applies :focus-visible rather
  // than the pointer-only focus state.
  const file = page.getByRole('button', { name: 'File', exact: true });
  await file.focus();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus-visible');
  await expect(focused).toHaveCount(1);
  const ring = await focused.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      tag: element.tagName,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      outlineOffset: styles.outlineOffset,
    };
  });
  expect(ring.tag).toBe('BUTTON');
  expect(ring.outlineStyle).toBe('solid');
  expect(ring.outlineWidth).toBe('2px');
  expect(ring.outlineOffset).toBe('3px');
});

test('reduced motion removes decorative animation while menus and editing remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const styles = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('.canvas-wrap');
    const root = getComputedStyle(document.documentElement);
    const element = canvas ? getComputedStyle(canvas) : null;
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionProperty: element?.transitionProperty,
      transitionDuration: element?.transitionDuration,
      scrollBehavior: root.scrollBehavior,
    };
  });
  expect(styles.reducedMotion).toBe(true);
  expect(styles.transitionProperty).toBe('none');
  expect(Number.parseFloat(styles.transitionDuration ?? '0')).toBeLessThan(0.001);
  expect(styles.scrollBehavior).toBe('auto');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Edit menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Edit menu' })).toBeHidden();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
});
