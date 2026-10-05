# Raster selection composition contract

Geometric selections, Color Range and Magic Wand all resolve to a bounded
canvas-sized alpha mask. When an existing selection is present, the Selection
mode controls deterministic alpha composition:

* **Replace** adopts the incoming mask.
* **Add** takes the per-pixel maximum.
* **Subtract** removes incoming coverage proportionally from the current mask.
* **Intersect** takes the per-pixel minimum.

The operation copies both inputs, rejects mismatched or oversized masks and
never mutates source pixels or the previous selection. The composed mask is
stored as a local document asset so undo, reload and project export retain the
exact alpha values. No inference provider or upload is involved. Pure tests
cover each operation, detached buffers, no-op detection and malformed input;
the protected desktop/mobile Color Range acceptance tests verify both
geometric-to-raster intersection and raster-to-geometric subtraction with soft
alpha. Async raster selection work captures its frame/index/asset snapshot and
publishes only while that frame remains current.
