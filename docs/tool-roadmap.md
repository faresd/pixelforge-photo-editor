# Pixel professional toolbar roadmap

This matrix distills the two user-provided toolbar references into an implementation and test plan for Pixel. The references are visual inspiration and capability requirements; Pixel uses its own interaction design, names and icons where that improves browser accessibility.

## Capability families

| Family | Reference capabilities | Pixel implementation stages | Required acceptance evidence |
| --- | --- | --- | --- |
| Navigation | Move (V), Hand (H), Zoom, Rotate View (R), toolbar layout | Move exists; Hand, Zoom are the next tools; add rotate-view viewport state and compact/expanded toolbar later | Keyboard shortcuts, pointer/touch gestures, no document-pixel mutation for viewport actions |
| Marquee selection | Rectangular, Elliptical, Single Row, Single Column (M) | Rectangular and elliptical marquee tools; row/column remain planned presets | Selection bounds round-trip, add/subtract/intersect/invert and feather pixel tests |
| Free selection | Lasso, Polygonal Lasso, Magnetic Lasso (L) | Freehand lasso polygon is implemented; polygonal and magnetic variants remain planned | Closed-path hit testing, feather/invert, mask export and undo |
| Automatic selection | Object Selection, Quick Selection, Magic Wand (W) | Contiguous Magic Wand color selection with a deterministic tolerance; object/quick selection after measured local or remote inference | Deterministic tolerance fixtures, disconnected regions, privacy disclosure for inference |
| Sampling and measurement | Eyedropper, Color Sampler, Ruler, Note, Count (I) | Eyedropper is implemented next; add multi-sample color table, ruler overlays and private notes | Sampled RGB/alpha exactness, non-destructive overlays, export omission rules |
| Crop and slicing | Crop, Perspective Crop, Slice, Slice Select (C) | Crop exists; add perspective transform and export slices as separate assets | Corner transform pixel comparison, non-overwrite export, undo and mobile controls |
| Retouching | Spot Healing, Remove, Healing Brush, Patch, Content-Aware Move, Red Eye (J) | Add clone/heal brush primitives, then patch and constrained content-aware operations | Before/after fixtures, source preservation, bounded memory, explicit undo |
| Painting | Brush, Pencil, Color Replacement, Mixer Brush (B); History Brush and Art History Brush (Y) | Brush/eraser/pencil exist with persisted size/opacity; add color replacement; history variants require command snapshots | Brush/pencil-size/hardness/opacity tests, pointer-pressure fallback, source asset retention |
| Stamping | Clone Stamp, Pattern Stamp (S) | Add clone stamp with explicit source point; pattern stamp after reusable tile assets | Source-offset determinism, edge clipping, undo and project reload |
| Fill and gradients | Gradient, Paint Bucket (G) | Add linear/radial gradients and contiguous fill with tolerance | Exact representative pixels, alpha/transparency, tolerance boundaries, undo |
| Blur and tonal retouch | Blur, Sharpen, Smudge; Dodge, Burn, Sponge; Adjustment Brush | Existing nondestructive blur; add sharpen/noise and brush-local tonal commands | Nondestructive adjustment serialization, bounded radius, before/after pixel fixtures |
| Vector drawing | Pen, Freeform Pen, Curvature Pen, add/delete/convert anchor (P); Path/Direct Selection (A) | Add path document primitives and editable anchors after shape-layer contract | Path round-trip, affine transforms, fill/stroke rendering and keyboard selection |
| Typography | Horizontal/Vertical Type, Type Mask (T) | Editable multiline horizontal type exists; add alignment, spacing, vertical and mask modes | Font fallback disclosure, line metrics, mask alpha, mobile editing |
| Shapes | Rectangle, Ellipse, Triangle, Polygon, Star, Line, Custom Shape (U) | Rectangle and ellipse layers exist; add remaining parametric shapes and line/path stroke controls | Parameter round-trip, exact transforms, fill/stroke pixels and undo |
| Foreground/background | Default black/white, swap, foreground/background wells | Pixel has one drawing color; add foreground/background pair and swap shortcut | Color state persistence, keyboard swap, fill/gradient integration |
| Quick mask | Quick Mask mode | Add selection preview/edit mode, converting painted alpha to a selection | Enter/exit mode, alpha-to-selection fidelity, no accidental source mutation |
| Screen modes | Standard, Full Screen with menu, Full Screen | Browser fullscreen and distraction-free canvas modes | Escape recovery, accessible controls, no loss of draft state |
| Asset intake and AI | Add from device, Adobe Stock, Generate Image | Local open/drop exists; add explicit local/remote source labels only when a service is implemented | Privacy and upload consent, unsupported-source labeling, deterministic fallback |
| Toolbar management | One/two-column toolbar, close, edit toolbar | Responsive one-column/two-column layout; user-customized tool order later | Mobile/desktop layout snapshots, keyboard reachability, persisted preferences |

## Current Pixel baseline

Implemented and deployed: Move, Crop, Brush, Pencil, Eraser, Text, Rectangle, Ellipse, layer properties, nondestructive per-layer adjustments, rotate/flip, local/cloud project persistence, optional Cheaply session and production CI/CD. The supplied Cheaply artwork is used in the brand lockup beside an original cyan Pixel monogram.

The active implementation increment adds Hand, Zoom, Eyedropper, Paint Bucket, Gradient, Clone, Healing, rectangular/elliptical/lasso and Magic Wand color selection, selection composition (replace/add/subtract/intersect), inversion, feather control and alpha-correct nondestructive masks. Each tool must have a dedicated desktop and mobile browser acceptance test before merge. Pixel does not claim Photoshop equivalence while the remaining families are incomplete.

## Delivery gates

1. Add the data model before exposing a tool that needs persistence (selection paths, masks, paths, adjustment commands and history references).
2. Every tool gets an accessible toolbar control, a keyboard shortcut where one is defined, mobile pointer behavior and a focused acceptance test.
3. Every raster operation is undoable, preserves the original asset until an explicit destructive action, and has at least one representative pixel assertion.
4. Every persisted property is validated, migrated and round-tripped through local and private cloud project files.
5. CI must run the desktop/mobile browser suite before production promotion; live deployment evidence must identify the tested commit.
6. AI, cloud asset sources and large-image processing remain opt-in and require an explicit privacy, quota and performance contract.

## Implementation schedule

Work proceeds in dependency-ordered increments. A phase is complete only when its tools, persistence, desktop/mobile acceptance tests and live revision evidence satisfy the delivery gates above.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0 — Foundation | Toolbar registry, shortcuts, responsive one/two-column layout, tool state, undo/redo, local draft recovery, test fixtures | Every registered tool has an accessible control; reload/bookmark recovery and CI smoke suite are green |
| 1 — Core navigation and raster basics | Move, Hand, Zoom, Eyedropper, Paint Bucket, Gradient, Brush, Pencil, Eraser, Color Replacement | Representative pixel tests, keyboard/touch gestures, undo and draft round-trip for each tool |
| 2 — Selection and crop | Rectangular/Elliptical/row/column marquee, Lasso family, Magic Wand, Quick/Object selection, Crop, Perspective Crop, Slice family, Quick Mask | Selection algebra and feathering are deterministic; masks and slices survive reload/export |
| 3 — Retouch and paint depth | Clone/Pattern Stamp, Healing/Spot Healing/Remove, Patch, Content-Aware Move, Red Eye, Mixer Brush, History Brush, Art History, Blur/Sharpen/Smudge, Dodge/Burn/Sponge | Before/after fixtures, bounded memory, source preservation, explicit undo and mobile pressure fallback |
| 4 — Vector and typography | Pen family, Path/Direct Selection, parametric shapes, line/custom shape, vertical type, type masks, alignment and spacing | Paths, anchors, shape parameters and text metrics round-trip; fill/stroke and mask pixels match fixtures |
| 5 — Workspace and asset workflows | Foreground/background wells, color swap/defaults, screen modes, toolbar customization, device/drop intake, export presets | Preferences persist safely, Escape recovers fullscreen, accessibility checks pass, export is deterministic |
| 6 — Intelligent and scale features | Opt-in object/quick inference, remote asset providers, generation, large-image tiling, performance instrumentation | Privacy/quota disclosure, offline fallback, performance budgets and provider failure tests are documented |

The current increment is Phase 1 navigation/sampling/fill/retouch groundwork. Phase 2 starts only after the Phase 1 browser suite and live deployment evidence are green. Phases 3–6 are intentionally sequenced after the selection, mask, path and persistence contracts they depend on; this keeps the editor extensible without presenting unfinished Photoshop-equivalent controls as complete.

## Reference extraction notes

The first reference groups tools into Move and Selection, Crop and Slice, Measurement, Retouching and Painting, Drawing and Type, Navigation, toolbar editing, colors, Quick Mask, screen modes and image generation. The second reference names the individual tools and shortcuts listed above. Tool names are recorded for planning and compatibility vocabulary; Pixel's UI remains free, anonymous by default and locally private.
