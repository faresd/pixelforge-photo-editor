# Adjustment Brush contract

PixelForge's Adjustment Brush is a local, nondestructive mask-painting tool for
source-free adjustment layers. It uses the existing canvas-space layer mask
asset: a reveal stroke increases mask alpha, while the shared Mask Eraser
conceals it. Adjustment parameters remain editable and underlying raster assets
are never rewritten.

An adjustment layer can receive a mask from the current selection through the
Layer panel or Layer menu. The Adjustment Brush then requires a visible,
unlocked adjustment layer with an enabled canvas-sized mask. Brush size,
hardness, opacity and pen/touch pressure sampling use the existing bounded mask
refinement implementation. Each completed stroke is one undoable history entry;
cancelled and no-op gestures do not create history.

Masks are validated as frame-sized assets, included in project asset compaction,
transformed with the document, and retained through local draft reload and
project export/import. Rendering applies the adjustment only where mask alpha
permits it, including inverted masks, while preserving source pixels and alpha
outside the adjustment.

This milestone does not claim Photoshop's bristle, wet-media, Art History,
semantic object selection or pressure-curve systems. Those remain separate
roadmap work with their own pixel and device-budget gates.
