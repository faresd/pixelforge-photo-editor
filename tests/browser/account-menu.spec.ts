import { test, expect } from '@playwright/test';

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

test('anonymous editing gets a stable artistic avatar and clear sign-in path', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toContainText('Guest editor');
  await expect(trigger).toContainText('Anonymous · local only');
  const avatar = trigger.locator('svg').first();
  await expect(avatar).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeVisible();
  await expect(page.getByText('Editing is free without an account.')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/photoeditor',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('authenticated account exposes projects, profile and shared logout routes', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: true, user: { id: 'member-test', name: 'Test Creator' } } }),
  );
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Open account menu for Test Creator' });
  await expect(trigger).toContainText('Test Creator');
  await expect(trigger).toContainText('Cheaply account');
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'My projects' })).toHaveAttribute('href', '/#projects-heading');
  await expect(page.getByRole('menuitem', { name: 'Cheaply profile' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/profile',
  );
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveAttribute(
    'href',
    'https://marketplace.cheaply.fr/marketplace/auth/logout',
  );
  await page.mouse.click(20, 120);
  await expect(page.getByRole('menu', { name: 'Account menu' })).toBeHidden();
});

test('public home keeps the same optional-account affordance', async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open guest profile menu' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Sign in with Cheaply' })).toBeVisible();
});
