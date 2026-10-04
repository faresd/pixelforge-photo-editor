/**
 * Shared palette taxonomy and Photoshop-style tool-family navigation.
 *
 * The editor keeps every implemented tool reachable in the compact palette,
 * while these definitions provide stable category labels and subtool groups
 * for the press-and-hold flyouts.  Keeping the model DOM-independent makes
 * keyboard cycling and category coverage easy to test without a browser.
 */

export type PaletteToolId =
  | 'move' | 'hand' | 'zoom' | 'eyedropper' | 'color-sampler' | 'ruler' | 'note' | 'count'
  | 'fill' | 'gradient' | 'clone' | 'heal' | 'spot-heal' | 'patch' | 'red-eye' | 'pattern-stamp'
  | 'crop' | 'perspective-crop' | 'slice' | 'brush' | 'pencil' | 'color-replace' | 'eraser'
  | 'background-eraser' | 'magic-eraser' | 'dodge' | 'burn' | 'sponge' | 'smudge' | 'pen'
  | 'direct-select' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'select'
  | 'ellipse-select' | 'row-select' | 'column-select' | 'lasso' | 'polygonal-lasso'
  | 'magnetic-lasso' | 'selection-brush' | 'magic-wand';

export type ToolCategory = {
  id: string;
  label: string;
  tools: readonly PaletteToolId[];
};

export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  { id: 'navigation', label: 'Navigate', tools: ['move', 'hand', 'zoom'] },
  { id: 'measure', label: 'Measure', tools: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'] },
  { id: 'marquee', label: 'Marquee', tools: ['select', 'ellipse-select', 'row-select', 'column-select'] },
  { id: 'lasso', label: 'Lasso', tools: ['lasso', 'polygonal-lasso', 'magnetic-lasso'] },
  { id: 'selection', label: 'Selection', tools: ['selection-brush', 'magic-wand'] },
  { id: 'crop', label: 'Crop & Slice', tools: ['crop', 'perspective-crop', 'slice'] },
  { id: 'retouch', label: 'Retouch', tools: ['clone', 'pattern-stamp', 'heal', 'spot-heal', 'patch', 'red-eye', 'smudge', 'dodge', 'burn', 'sponge'] },
  { id: 'paint', label: 'Paint & Fill', tools: ['brush', 'pencil', 'color-replace', 'gradient', 'fill', 'eraser', 'background-eraser', 'magic-eraser'] },
  { id: 'draw', label: 'Draw & Type', tools: ['pen', 'direct-select', 'text', 'rectangle', 'ellipse', 'line', 'polygon'] },
] as const;

/** Photoshop's repeated-key families. Singletons are intentionally omitted. */
export const TOOL_FAMILIES: Readonly<Record<string, readonly PaletteToolId[]>> = {
  c: ['crop', 'perspective-crop', 'slice'],
  g: ['gradient', 'fill'],
  b: ['brush', 'pencil', 'color-replace'],
  u: ['rectangle', 'ellipse', 'line', 'polygon'],
  m: ['select', 'ellipse-select', 'row-select', 'column-select'],
  i: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'],
  l: ['lasso', 'polygonal-lasso', 'magnetic-lasso', 'selection-brush'],
  e: ['eraser', 'background-eraser', 'magic-eraser'],
  o: ['dodge', 'burn', 'sponge'],
  s: ['clone', 'pattern-stamp'],
  j: ['heal', 'spot-heal', 'patch', 'red-eye'],
};

/** Pointer/touch flyouts use Photoshop's visible tool families.  Selection
 * Brush stays in the L keyboard family for backward compatibility, while its
 * compact flyout lives beside Magic Wand under the W-style Selection group. */
export const TOOL_FLYOUTS: Readonly<Record<string, readonly PaletteToolId[]>> = {
  marquee: ['select', 'ellipse-select', 'row-select', 'column-select'],
  lasso: ['lasso', 'polygonal-lasso', 'magnetic-lasso'],
  selection: ['selection-brush', 'magic-wand'],
  crop: ['crop', 'perspective-crop', 'slice'],
  fill: ['gradient', 'fill'],
  paint: ['brush', 'pencil', 'color-replace'],
  shape: ['rectangle', 'ellipse', 'line', 'polygon'],
  measure: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'],
  eraser: ['eraser', 'background-eraser', 'magic-eraser'],
  tone: ['dodge', 'burn', 'sponge'],
  stamp: ['clone', 'pattern-stamp'],
  healing: ['heal', 'spot-heal', 'patch', 'red-eye'],
};

export function familyForTool(tool: string): string | undefined {
  return Object.entries(TOOL_FAMILIES).find(([, tools]) => tools.includes(tool as PaletteToolId))?.[0];
}

export function flyoutForTool(tool: string): string | undefined {
  return Object.entries(TOOL_FLYOUTS).find(([, tools]) => tools.includes(tool as PaletteToolId))?.[0];
}

export function flyoutTools(toolOrId: string): readonly PaletteToolId[] {
  if (TOOL_FLYOUTS[toolOrId]) return TOOL_FLYOUTS[toolOrId];
  const flyout = flyoutForTool(toolOrId);
  return flyout ? TOOL_FLYOUTS[flyout] : [];
}

export function categoryForTool(tool: string): string | undefined {
  return TOOL_CATEGORIES.find((category) => category.tools.includes(tool as PaletteToolId))?.id;
}

export function familyTools(toolOrKey: string): readonly PaletteToolId[] {
  if (TOOL_FAMILIES[toolOrKey]) return TOOL_FAMILIES[toolOrKey];
  const family = familyForTool(toolOrKey);
  return family ? TOOL_FAMILIES[family] : [];
}

export function cycleFamilyTool(
  current: string,
  key: string,
  reverse = false,
): PaletteToolId | undefined {
  const tools = familyTools(key);
  if (!tools.length) return undefined;
  const index = tools.indexOf(current as PaletteToolId);
  const offset = reverse ? -1 : 1;
  return tools[(index < 0 ? 0 : index + offset + tools.length) % tools.length];
}

export function validatePaletteTaxonomy(toolIds: readonly string[]): boolean {
  const expected = new Set(toolIds);
  const categorized = TOOL_CATEGORIES.flatMap((category) => category.tools);
  return categorized.length === expected.size &&
    new Set(categorized).size === expected.size &&
    categorized.every((tool) => expected.has(tool));
}
