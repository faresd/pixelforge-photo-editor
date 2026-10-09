# Pen and Path layer contract

PixelForge stores editable `path` layers. Each local-coordinate anchor can
optionally carry incoming and outgoing cubic Bézier handles, a `closed` flag,
and independent fill/stroke appearance metadata. Existing straight-segment
paths omit handles and remain byte-compatible. The layer affine matrix remains
separate from the nodes, so moving, scaling, rotating, and flipping the layer
does not bake geometry into pixels.

The Pen (`P`) places one node per click. Holding **Shift** while dragging a
point creates an outgoing cubic handle; holding **Alt** mirrors it to the
incoming side. Clicking the first node after at least three nodes closes and
commits a path layer. Escape or a pointer cancel clears an in-progress path
without changing document history. Closed paths render a filled interior and
optional rounded stroke; open paths render their segments as a stroke. Cubic
extrema are included in bounds, hit-testing samples curve segments, and SVG
serialization emits deterministic `C` commands.

The Freeform Pen samples a bounded pointer stroke, removes sub-pixel jitter and
derives neighbouring tangent handles for an open editable cubic path. The
Curvature Pen uses Photoshop-style click-to-place anchors: each new point is
smoothed from its neighbours, and clicking the first point after three anchors
commits a closed filled path. Both tools preserve the original anchors and
handles for Direct Selection, reject malformed or overlong input, and cancel
without a history entry on Escape or pointer cancellation.

Direct Selection (`A`) selects a node on the active visible, unlocked path and
drags it in local coordinates through the layer matrix. A drag commits one
history entry and therefore participates in undo/redo. Locked and hidden paths
reject node edits. The Layers panel exposes path closure, fill/stroke toggles,
colors, stroke width, and the node count.

Path metadata is validated on draft import and project export. Node coordinates
and style values are bounded to keep malformed or oversized project files from
allocating unbounded work. Raster export uses the same affine, opacity, blend,
and adjustment pipeline as other editable layers.
