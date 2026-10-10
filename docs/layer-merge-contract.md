# Merge Layers contract

`Layer → Merge Layers` combines either the active layer with the immediately
lower layer or the persisted multi-layer selection. The pair path is bounded
to two visible, unlocked, ungrouped adjacent layers. The selected-set path
requires at least two visible, unlocked, ungrouped, root-level layers whose
stack indexes are contiguous. Missing, hidden, locked, grouped,
non-contiguous, insufficient, or partially referenced artboard selections
disable the command with an explicit guard reason. Folder members remain
disabled pending a dedicated isolated-folder merge contract.

The selected pair or contiguous root-level range is rendered through the
normal document pipeline before replacement, so transforms, opacity, blend
mode, adjustments, styles, masks and local retouch metadata contribute to the
merged pixels. The result is one frame-sized raster layer at the range's
lowest stack position; it is visible, unlocked, uses neutral editable metadata
and becomes the active layer. Other layers, including hidden layers, retain
their order and properties. The original raster assets are immutable and
remain available through history.

Merging creates one undoable history frame. Undo and redo restore or reapply
the selected range deterministically, and local draft reload plus `.pixelforge`
project round trips retain the merged raster and unaffected layers. Artboards
that reference every merged source replace those IDs with the composite. A
partial artboard selection is rejected before rendering so a full-frame
composite cannot leak into an unrelated viewport. The operation is local-only
and does not upload source pixels.

Pure coverage in `tests/layer-merge.test.mjs` validates pair and selected-range
planning, canonical stack ordering, all guard reasons, immutable application,
group preservation and artboard safety. Browser coverage exercises the Layer
menu on desktop and mobile, compares deterministic RGBA samples, verifies
source retention and history round trips, and covers undo/redo, reload, project
export and non-contiguous selection disabling. Locked/hidden/folder
interaction cases remain covered by the fail-closed pure planner and are the
next browser expansion.
