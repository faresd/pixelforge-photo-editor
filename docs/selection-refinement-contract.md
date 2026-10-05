# Selection refinement contract

PixelForge's **Select → Grow…**, **Select → Contract…** and **Select → Border…** commands refine the
current selection locally without modifying any layer pixels. The dialog takes
a whole-pixel radius from 1 through 1,000. The operation renders the current
selection (including composed geometric parts, feathering, inversion and
transformed masks), applies a deterministic square alpha morphology, and stores
the result as a canvas-sized nondestructive selection mask.

Grow uses a centred max filter; Contract uses a centred min filter. Border computes
the expanded outer alpha minus the contracted inner alpha, clamping the result at
zero. Partial alpha coverage is preserved through each filter and subtraction,
and document edges are clamped so a selection cannot address pixels outside the
canvas. A zero radius is accepted by the pure helper for grow/contract identity
testing; Border returns an empty band at zero. The UI requires at least one
pixel. The implementation uses separable sliding extrema, so the work is
linear in the number of pixels rather than radius squared.

The source selection remains available to Undo and history. The generated mask
is included in local drafts and `.pixelforge` project files, and reopens with
the same alpha. Refinement is local and offline; no image or mask is uploaded.
The asynchronous renderer captures the history index and frame identity and
abandons a stale result before adding an asset or committing a new frame.
The current contract intentionally does not claim Photoshop's circular-kernel
or edge-aware Select and Mask algorithms. Smooth, Feather, Similar, Color Range
and semantic Subject/Sky selection remain separate roadmap items.

## Required evidence

- pure tests cover centred expansion, contraction, fractional alpha, identity,
  source immutability, malformed dimensions, wrong buffer sizes and radius
  bounds;
- desktop and mobile browser tests open each dialog, reject malformed values,
  verify representative mask alpha growth/shrinkage/border bands, and verify reload/project
  round trips;
- the normal TypeScript, lint, build and full browser gates remain required
  before the command is enabled in production.
