# Local blur effects contract

PixelForge's Filter → Blur family includes six local, nondestructive effects:
**Box Blur…**, **Gaussian Blur…**, **Motion Blur…**, **Radial Blur…**, **Field
Blur…** and **Tilt-Shift…**. Each effect is stored on the selected
layer as `adjustments.filterEffects`, so changing or clearing the effect never
rewrites the immutable raster asset.

The metadata record uses the existing validated effect shape:

- `type` is `box-blur`, `gaussian-blur`, `motion-blur` or `radial-blur`.
- `amount` is a 0–100 blend percentage. Zero is an identity operation.
- `radius` is an integer source-pixel radius from 0–64. Zero is an identity
  operation and the inspector exposes the value as **Blur radius**. Radial
  Blur uses the same bounded field as degrees of **Angular sweep**.
- `angle`, `centerX`, `centerY` and `seed` remain serialized for the shared
  filter schema and are normalized at every document boundary.

Box Blur uses a separable running-sum kernel. Gaussian Blur uses a separable,
normalized Gaussian kernel with `sigma = max(0.5, radius / 3)`. Both kernels
weight RGB by neighbouring alpha and renormalize the available samples at
image edges. They retain every source alpha byte and leave fully transparent
RGB padding unchanged, which avoids dark halos around cutouts. The renderer
always copies the source before writing output, is deterministic for a given
metadata record, and is applied in layer-local coordinates after decoding the
immutable source asset. Layer transforms and masks therefore remain editable.

Motion Blur samples a symmetric, nearest-neighbour line through each covered
pixel. Its bounded radius is the same 0–64 source-pixel field and its angle is
an editable -180–180 degree direction. Samples are weighted by alpha, so
transparent padding cannot darken the result; destination alpha and hidden RGB
remain unchanged. The directional kernel is local and deterministic, with no
remote processing or source upload.

Radial Blur is the spin variant: seventeen samples follow each covered
pixel's polar ring around the editable **Blur center X/Y**. The centre uses
normalized 0–1 coordinates and defaults to the centre of the source layer;
the exact centre pixel remains unchanged. Angular sweep is bounded at
0–64 degrees, with zero and zero amount producing exact identity copies.
The effect weights samples by alpha, retains destination alpha and hidden
transparent RGB, clamps samples to source bounds, and runs with a fixed sample
count independent of the sweep. This is a local spin effect; zoom-style Radial
Blur and Blur Gallery multi-pin controls remain separate planned capabilities.

The pure filter suite covers normalization and strict validation, identity and
one-pixel bounds, deterministic repeatability, source immutability, opaque and
transparent alpha edges, hidden RGB padding, and representative Box/Gaussian/
Motion/Radial kernel output. Radial fixtures also cover centre changes, corner
centres, constant colour, partial-alpha neighbours, one-pixel/one-column bounds,
zero amount/sweep and fixed-buffer source preservation. The desktop/mobile browser suite covers enabled menu
commands, inspector editing, angle/radius controls, undo-compatible history
metadata, source-asset retention, alpha preservation, reload and project-
download round trips. Radial acceptance explicitly checks reload, project
import, editable centre/sweep metadata and undo restoration. These checks run in both Playwright projects (`desktop`
and `mobile`).
