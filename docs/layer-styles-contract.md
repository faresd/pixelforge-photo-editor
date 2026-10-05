# Layer Styles milestone contract

This milestone defines a bounded, editable Layer Style stack without changing
the existing raster assets, selection masks, or filter effect metadata. The
standalone implementation is in `src/layerStyles.ts`; it is intentionally
pure so the main-thread renderer and the OffscreenCanvas worker can share the
same pixel recipe.

Each layer may eventually persist a `layerStyles` object containing two optional
decorations: `dropShadow` and `outline`. The values are finite and bounded:

- Drop shadow uses a six-digit hex colour, opacity `0..1`, offsets `-256..256`
  pixels, and box blur `0..64` pixels.
- Outline uses a six-digit hex colour, opacity `0..1`, and width `1..32`
  pixels.
- `enabled` is explicit on both decorations. Missing or malformed legacy
  values resolve to the neutral disabled defaults.

`applyLayerStylesPixels` receives RGBA bytes and returns a new byte array. It
draws shadow first, then the outline ring, then source pixels over both. The
source array is never mutated, and all math uses integer alpha operations plus
a separable box blur. This gives the worker and browser renderer identical
pixels and avoids browser-specific `CanvasRenderingContext2D.filter` output.

The safe integration boundary is the layer renderer: render one layer into an
isolated frame-space surface with its existing matrix, masks, adjustments and
opacity-independent source, call `applyLayerStylesPixels`, then composite the
styled surface once using the layer blend and group opacity. The source asset
and mask references remain unchanged, so duplicate, undo, reload, export and
history trimming continue to work through the existing document model.

The editor panel should expose the two enabled toggles and their bounded
controls through the existing `edit({ ... })` callback. The panel must disable
those controls for locked layers and keep the style object when changing any
other layer field. A desktop and 390px mobile browser test should verify that a
style toggle changes rendered pixels, project export/reload preserves the
metadata, and undo restores the neutral style while the original asset id is
unchanged.

This contract deliberately excludes selections, masks, filters, and rasterize:
Layer Styles decorate the rendered result and never bake or rewrite any of
those data structures. The current branch has concurrent selection/filter work
in `app/page.tsx`, so wiring the contract into that file is left as a follow-up
to avoid merging unrelated feature changes in the same slice.
