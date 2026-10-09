# Crystallize effect contract

PixelForge's **Filter → Pixelate → Crystallize…** command is a bounded,
nondestructive local approximation of Photoshop Crystallize. It stores only
validated `filterEffects` metadata (`type: crystallize`, `amount`, `radius`
and `seed`) on the active layer; the source asset is never replaced.

The renderer derives a deterministic jittered Voronoi-style cell centre from
the cell size and seed, samples the immutable source at that centre, and
blends visible pixels toward the sampled colour by amount. Cell size is
bounded to the existing 1–64 px control (the renderer uses a minimum 2 px
cell), dimensions remain unchanged, source alpha is copied byte-for-byte and
fully transparent RGB padding is not sampled or rewritten. Amount 0 and
radius 0 are identity operations, and changing the seed produces a stable,
reproducible alternate cell layout.

The contract is covered by `tests/filter-effects.test.mjs` and
`tests/browser/filter-effects.spec.ts` on desktop and mobile. Acceptance
checks cover deterministic output, source-asset identity, alpha and
transparent-edge safety, metadata persistence, local reload/project import,
undo, and the accessible Filter menu and cell-size control. This is a local
cell approximation; true polygonal region reconstruction and geometric
canvas expansion remain staged.
