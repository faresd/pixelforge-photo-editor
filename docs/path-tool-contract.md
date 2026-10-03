# Pen and Path layer contract

PixelForge's first Pen milestone stores straight segments as an editable `path`
layer. A path contains local-coordinate corner nodes, a `closed` flag, and
independent fill/stroke appearance metadata. The layer affine matrix remains
separate from the nodes, so moving, scaling, rotating, and flipping the layer
does not bake geometry into pixels.

The Pen (`P`) places one node per click. Clicking the first node after at least
three nodes closes and commits a path layer. Escape or a pointer cancel clears
an in-progress path without changing document history. Closed paths render a
filled interior and optional rounded stroke; open paths render their segments
as a stroke.

Direct Selection (`A`) selects a node on the active visible, unlocked path and
drags it in local coordinates through the layer matrix. A drag commits one
history entry and therefore participates in undo/redo. Locked and hidden paths
reject node edits. The Layers panel exposes path closure, fill/stroke toggles,
colors, stroke width, and the node count.

Path metadata is validated on draft import and project export. Node coordinates
and style values are bounded to keep malformed or oversized project files from
allocating unbounded work. Raster export uses the same affine, opacity, blend,
and adjustment pipeline as other editable layers.
