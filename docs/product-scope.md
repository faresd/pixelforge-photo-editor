# PixelForge product direction

User requirements, updated 2026-10-02. The demand research is in product-research.txt.

PixelForge is a free, publicly accessible photo editor. Authentication is optional and must reuse the existing Cheaply Marketplace customer session. Anonymous work must survive reloads and bookmarked document URLs. Signed-in users need a project library for reopening and continuing their work. Discarding a draft returns to a public home page that promotes real, available capabilities.

The long-term target is a professional image editor with Photoshop-class breadth. This is a staged engineering program, not a claim that the current single-canvas editor has professional parity. The original ten-feature research shortlist is now input to this broader authorized direction.

## Delivery order and acceptance

1. Reliable foundation: tested Google Cloud releases, anonymous editing, autosave, honest save/error states, recoverable project format, bookmarks, home page, discard action, existing-session sign-in, private project library.
2. Document engine: true editable raster, text and vector layers; order, visibility, locking, duplication, opacity and blend modes; groups; masks; undoable document commands; portable project import/export. Reload must preserve every editable property.
3. Precision editing: numeric resize/canvas size/crop and presets, free transform, rectangular/elliptical/lasso selections, magic wand, feather/invert selections, guides/snapping, eyedropper, configurable brushes, clone/heal, gradients, vector shapes and editable typography.
4. Nondestructive image work: adjustment layers, curves/levels, color balance, masks, filter previews, smart-object-style linked sources, before/after comparison. Large images need tiled rendering, workers and bounded undo memory.
5. Production workflows: batch conversion/resizing/compression, target-size export, HEIC import, metadata privacy controls, PSD interoperability with explicit fidelity limits, keyboard/accessibility coverage, mobile and pen support, installable/offline operation.
6. Advanced automation: background removal and edge refinement, object cleanup and optional AI tools after licensing, quality, privacy and sustainable free operation have been validated.

## Release gates

No decorative controls presented as working tools. Use versioned documents and migrations, pixel/round-trip tests, private-project authorization tests, concurrent-save conflict protection, storage failure/recovery tests and desktop/mobile browser acceptance. CI must verify the deployed revision, not only build successfully. Cloud project storage must be owner-scoped, free to end users and separate from anonymous local storage. Do not silently upload existing local photos upon sign-in.

Current implementation status is recorded in the PR and deployment evidence; this document is a direction and acceptance contract, not a completion checklist.
