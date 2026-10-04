# Pattern Stamp contract

Pattern Stamp is PixelForge's local, Photoshop-style `S` family tool. It
composites a deterministic tile through the same bounded radial coverage used
by Brush and Clone. The source is generated from the foreground/background
colour wells; PixelForge never uploads a pattern source or stores a hidden
image asset for this tool.

The persisted settings are `patternId` (`checker`, `stripes`, `dots`, `grid`,
or `diagonal`) and `patternTileSize` (an integer from 4 through 128 pixels).
Older drafts omit both keys and safely use `checker` and 32 px. Draft
validation rejects unknown ids, non-integer sizes and out-of-range sizes.

Each pointer sample is clipped to a local radial bounds rectangle before
Canvas2D `getImageData`/`putImageData`. The pure `applyPatternStamp` primitive
enforces the 16,000 × 16,000 / 16 million-pixel canvas limits, validates all
RGBA channels and preserves the absolute tile phase when a bounded sub-buffer
is processed. Softness, opacity and opt-in pen/touch pressure are inherited
from the common brush contract. A locked, hidden or non-raster active layer is
rejected before decode and does not create history. Pointer cancellation
restores the previous render; a completed gesture creates one undoable raster
asset commit.

The current patterns are intentionally small local motifs rather than a
general pattern-import system. Image-defined presets, custom pattern libraries
and GPU/worker tiled painting remain later scale milestones. Coverage lives in
`tests/pattern-stamp.test.mjs` and
`tests/browser/pattern-stamp.spec.ts` (desktop and mobile projects), including
determinism, edge clipping, alpha compositing, settings persistence,
undo/redo, reload and locked-layer rejection.
