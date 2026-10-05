# Background-removal mask refinement contract

PixelForge's **Mask Brush** (`K`) and **Mask Eraser** (`K`) repair an existing
layer mask without changing the raster source. Mask Brush increases coverage;
Mask Eraser decreases it. Both tools use the same bounded size, hardness,
opacity and pressure model as painting tools, interpolate pointer samples, and
apply one undoable edit when the gesture ends. Escape or pointer cancellation
discards the preview.

The preview is a detached canvas-sized mask. A committed gesture creates a new
mask asset and keeps the source asset and its hidden RGB bytes unchanged. The
mask remains editable through project export/import, local draft recovery and
undo/redo. Existing mask inversion and disable state are preserved. Locked,
hidden, non-raster and mask-less layers are guarded; users must create a mask
or run **Remove Background** first.

The pure renderer accepts RGBA mask bytes and edits alpha only. It validates
version `1`, a 1–256 point stroke, size 1–10,000 px, hardness 0–100, opacity
0–1, pressure 0–1, and the `reveal`/`conceal` modes. A mask is capped at
16 megapixels and 128 persisted strokes are allowed by the contract. These
limits are browser safety budgets, not a claim of Photoshop-scale capacity.

Coverage uses bounded radial stamps with spacing at most one quarter of the
brush size. Fully transparent pixels retain their RGB bytes. The feature is a
deterministic local repair tool; it does not claim semantic hair selection,
object recognition or generative fill.

The contract is covered by `tests/mask-refinement.test.mjs` and
`tests/browser/mask-refinement.spec.ts` on desktop and mobile, including source
immutability, edge clipping, pressure/opacity, undo, reload, project round
trip, missing-mask and locked-layer guards.
