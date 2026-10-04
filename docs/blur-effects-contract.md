# Local blur effects contract

PixelForge's Filter → Blur family includes two local, nondestructive effects:
**Box Blur…**, **Gaussian Blur…** and **Motion Blur…**. Each effect is stored on the selected
layer as `adjustments.filterEffects`, so changing or clearing the effect never
rewrites the immutable raster asset.

The metadata record uses the existing validated effect shape:

- `type` is `box-blur`, `gaussian-blur` or `motion-blur`.
- `amount` is a 0–100 blend percentage. Zero is an identity operation.
- `radius` is an integer source-pixel radius from 0–64. Zero is an identity
  operation and the inspector exposes the value as **Blur radius**.
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

The pure filter suite covers normalization and strict validation, identity and
one-pixel bounds, deterministic repeatability, source immutability, opaque and
transparent alpha edges, hidden RGB padding, and representative Box/Gaussian/
Motion kernel output. The desktop/mobile browser suite covers enabled menu
commands, inspector editing, angle/radius controls, undo-compatible history
metadata, source-asset retention, alpha preservation, reload and project-
download round trips. These checks run in both Playwright projects (`desktop`
and `mobile`).
