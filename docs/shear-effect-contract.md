# Linear local Shear milestone

The Filter menu exposes a first-stage linear horizontal shear as editable
`filterEffects.type = 'shear'` metadata. It inverse-samples source colour with
premultiplied-alpha bilinear interpolation and clamps coordinates at the
source bounds. Source assets, destination alpha, and hidden transparent RGB
remain unchanged. This is an artistic colour remap, not a geometric transform
of the layer silhouette.

The displacement at the top/bottom is `radius * amount / 100 * sin(angle)`
about the normalized vertical pivot `centerY` (default 0.5). Radius is bounded
to 0–64 pixels; angle is bounded to -180–180 degrees. The centre row and
single-row images are unchanged. Zero strength, radius or direction is an
identity operation. The UI labels this as a local linear approximation.

Unit tests independently check signed inverse-map coordinates, fractional
interpolation, centre-row identity, edge clamping, detached output, transparent
sample exclusion, partial-alpha preservation and tiny images. Desktop/mobile
acceptance checks cover menu activation, control editing, representative pixels,
immutable source assets, reload, project download/import and undo.

Remaining scope: nonlinear editable shear curves, wrap-around edges and true
silhouette deformation. These capabilities remain unimplemented and this slice
does not count as Photoshop-equivalent Shear completion. Rendering is linear in
pixel count with four source samples per destination; device timing budgets
remain to be measured.
