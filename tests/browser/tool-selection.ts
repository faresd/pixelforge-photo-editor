import { expect, type Page } from '@playwright/test';

// Accessible names form the browser contract. Do not select hidden variants
// through application state: exercise the same toolbar and flyout as a user.
const TOOL_FAMILIES = [
  ['Select', 'Elliptical marquee', 'Single Row marquee', 'Single Column marquee'],
  ['Lasso', 'Polygonal Lasso', 'Magnetic Lasso'],
  ['Selection Brush', 'Magic Wand'],
  ['Crop', 'Perspective Crop', 'Slice'],
  ['Gradient', 'Fill'],
  ['Brush', 'Pencil', 'Color Replace'],
  ['Shape', 'Ellipse', 'Line', 'Polygon'],
  ['Eyedropper', 'Color Sampler', 'Ruler', 'Note', 'Count'],
  ['Eraser', 'Background Eraser', 'Magic Eraser'],
  ['Dodge', 'Burn', 'Sponge'],
  ['Clone', 'Pattern Stamp'],
  ['Healing', 'Spot Healing', 'Patch', 'Red Eye'],
  ['Mask Brush', 'Mask Eraser'],
] as const;

const FLYOUT_LABELS: Readonly<Record<string, string>> = {
  Select: 'Rectangular Marquee',
  'Elliptical marquee': 'Elliptical Marquee',
  Lasso: 'Freeform Lasso',
};

/** Select a tool through the compact palette, including an inactive subtool. */
export async function selectTool(page: Page, label: string): Promise<void> {
  const palette = page.getByTestId('tool-palette');
  await expect(palette).toBeVisible();
  const requested = palette.getByRole('button', {
    name: `${label} tool`,
    exact: true,
  });
  if (await requested.count()) {
    await requested.click();
  } else {
    const family = TOOL_FAMILIES.find((labels) =>
      (labels as readonly string[]).includes(label),
    );
    if (!family) throw new Error(`No toolbar family is defined for ${label}`);
    let opened = false;
    for (const representative of family) {
      const button = palette.getByRole('button', {
        name: `${representative} tool`,
        exact: true,
      });
      if (!(await button.count())) continue;
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      await button.press('ArrowDown');
      opened = true;
      break;
    }
    if (!opened) throw new Error(`No visible toolbar representative for ${label}`);
    const flyout = page.locator('.tool-flyout[role="menu"]');
    await expect(flyout).toBeVisible();
    await flyout.getByRole('menuitem', {
      name: FLYOUT_LABELS[label] ?? label,
      exact: true,
    }).click();
    await expect(flyout).toBeHidden();
  }
  await expect(requested).toHaveAttribute('aria-pressed', 'true');
}
