# PixelForge local background-removal contract

PixelForge exposes **Edit → Remove Background…** as an offline, nondestructive
fallback for simple backdrops. It never uploads an anonymous image and never
rewrites the raster source asset. The command renders the active layer into a
canvas-space buffer, labels connected colour components that touch the canvas
edge as background, and stores the resulting alpha as the layer's regular
canvas-sized mask.

The tolerance is the persisted colour-tolerance control (0–255). Components are
compared to their own seed colour using the maximum RGBA channel distance. A
component that does not touch an edge keeps its original alpha, so enclosed
subjects and antialiased interior pixels remain editable. Transparent source
pixels remain transparent. The method is deterministic and bounded by the
document pixel limit; it is not semantic subject detection and can remove a
foreground object that touches the edge or a highly varied background that
exceeds the tolerance.

The original asset, mask asset, enabled/inverted state and history entry are
validated by the document schema. Undo, reload and `.pixelforge` project export
restore the same source and mask. Locked, hidden or non-raster layers disable
the menu command. The browser acceptance suite checks representative edge and
subject alpha values, source preservation, undo, reload and the locked-layer
guard on desktop and mobile profiles; pure tests cover enclosed subjects,
soft/transparent alpha, tolerance boundaries and invalid input.

This local feature does not claim Photoshop's cloud Subject Select, hair/edge
refinement, generative fill, or semantic object quality. Those remain separate
opt-in work requiring a quality benchmark, privacy disclosure, cancellation,
quota and provider-failure contract.
