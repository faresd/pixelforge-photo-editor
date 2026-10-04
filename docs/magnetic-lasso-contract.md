# Magnetic Lasso contract

PixelForge's Magnetic Lasso is a local, bounded selection tool. At pointer
down it samples the active visible raster layer into an immutable RGBA buffer.
As the pointer moves, each point is searched within a bounded radius and is
snapped to the strongest nearby luminance edge. Distance is a deterministic
tie-breaker, so the same image and pointer samples produce the same polygon.

The completed path is stored as the existing polygon `Selection` model. It
therefore supports the same replace/add/subtract/intersect composition,
feathering, inversion, mask creation, undo, reload and project round trips as
the other geometric selections. Escape and pointer cancellation discard the
unfinished path without changing history. The sampler never uploads pixels and
does not infer semantic subjects; low-contrast or textured edges can require
manual cleanup with Selection Brush or Quick Mask.

The pure contract tests cover deterministic edge preference, malformed image
and radius rejection, and degenerate-area handling. Browser acceptance covers
desktop edge-following, persisted polygon output and mobile touch cancellation.
