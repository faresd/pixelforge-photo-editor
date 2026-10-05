import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_CATEGORIES,
  compactCategoryTools,
  TOOL_FAMILIES,
  categoryForTool,
  cycleFamilyTool,
  familyForTool,
  familyTools,
  flyoutForTool,
  flyoutTools,
  validatePaletteTaxonomy,
} from '../src/toolPalette.ts';

const toolIds = TOOL_CATEGORIES.flatMap((category) => category.tools);

test('palette taxonomy covers every tool exactly once', () => {
  assert.equal(validatePaletteTaxonomy(toolIds), true);
  assert.equal(new Set(toolIds).size, toolIds.length);
  assert.ok(TOOL_CATEGORIES.every((category) => category.label.length > 0));
});

test('categories and families resolve stable labels for common Photoshop groups', () => {
  assert.equal(categoryForTool('clone'), 'retouch');
  assert.equal(categoryForTool('polygon'), 'draw');
  assert.equal(familyForTool('clone'), 's');
  assert.equal(familyForTool('magic-wand'), 'w');
  assert.equal(flyoutForTool('select'), 'marquee');
  assert.equal(flyoutForTool('lasso'), 'lasso');
  assert.equal(flyoutForTool('selection-brush'), 'selection');
  assert.deepEqual(familyTools('s'), ['clone', 'pattern-stamp']);
  assert.deepEqual(familyTools('clone'), ['clone', 'pattern-stamp']);
  assert.deepEqual(familyTools('move'), []);
  assert.deepEqual(flyoutTools('selection'), ['selection-brush', 'magic-wand']);
  assert.deepEqual(flyoutTools('magic-wand'), ['selection-brush', 'magic-wand']);
});

test('family cycling wraps and supports reverse keyboard navigation', () => {
  assert.equal(cycleFamilyTool('brush', 'b'), 'pencil');
  assert.equal(cycleFamilyTool('color-replace', 'b'), 'brush');
  assert.equal(cycleFamilyTool('brush', 'b', true), 'color-replace');
  assert.equal(cycleFamilyTool('unknown', 'b'), 'brush');
  assert.equal(cycleFamilyTool('clone', 'missing'), undefined);
});

test('family definitions stay aligned with repeated-key groups', () => {
  for (const [key, tools] of Object.entries(TOOL_FAMILIES)) {
    assert.ok(tools.length >= 2, `${key} must expose a flyout`);
    for (const tool of tools) assert.equal(familyForTool(tool), key);
  }
});

test('selection flyouts preserve Photoshop M/L/W group membership', () => {
  assert.deepEqual(flyoutTools('marquee'), ['select', 'ellipse-select', 'row-select', 'column-select']);
  assert.deepEqual(flyoutTools('lasso'), ['lasso', 'polygonal-lasso', 'magnetic-lasso']);
  assert.deepEqual(flyoutTools('selection'), ['selection-brush', 'magic-wand']);
});

test('compact category slots show one family representative and active variant', () => {
  const lasso = TOOL_CATEGORIES.find((category) => category.id === 'lasso');
  assert.deepEqual(compactCategoryTools(lasso), ['lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'magnetic-lasso'), ['magnetic-lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'move', { lasso: 'magnetic-lasso' }), ['magnetic-lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'lasso', { lasso: 'magnetic-lasso' }), ['lasso']);
  const retouch = TOOL_CATEGORIES.find((category) => category.id === 'retouch');
  assert.deepEqual(compactCategoryTools(retouch), ['clone', 'heal', 'smudge', 'dodge']);
});
