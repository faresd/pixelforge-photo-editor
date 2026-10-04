# Selection Brush contract

PixelForge's Selection Brush paints a bounded, canvas-sized alpha mask locally.
It uses the same size, hardness, opacity and optional pen/touch pressure
controls as the paint tools, then combines the detached stroke with the active
selection using Replace, Add, Subtract or Intersect. Stroke segments are
accumulated before composition so a multi-point gesture has stable semantics
for every operation.

The operation never mutates source raster assets. A successful gesture creates
one undoable selection frame with a versioned image asset; reload and project
export retain the alpha pixels. Empty, cancelled, locked-document and
zero-opacity gestures do not create history. The implementation is local and
does not infer subjects or upload image data. Semantic/object-aware selection,
magnetic edge following and Quick Select remain separate roadmap items.

The pure contract validates canvas dimensions (at most 16 megapixels), brush
size, hardness, opacity, pressure and mask lengths. Pixel fixtures cover edge
clipping, partial alpha, pressure scaling, immutable inputs, operation algebra,
no-op detection and malformed settings. Browser coverage must exercise a real
desktop and touch/mobile pointer gesture, representative mask alpha, undo and
local project reload.
