# Lens Correction filter contract

Pixel's first Lens Correction slice is a deterministic bounded radial correction. Pixels are inverse-sampled toward an editable centre using a smooth quadratic profile, premultiplied-alpha bilinear interpolation, and clamped source coordinates. Source assets, destination alpha and transparent RGB remain unchanged; the metadata remains editable across drafts and project files.

The effect stores `filterEffects.type = lens-correction` with bounded amount, radius, centre and seed metadata. Amount controls correction strength and radius controls the influence extent. This first stage is an offline local approximation and does not load camera/lens profiles or expand the canvas.

Unit tests cover centre identity, deterministic edge remapping, radius/amount identities, transparent-source exclusion and detached buffers. Desktop/mobile acceptance covers menu activation, editable radius and centre controls, representative pixels, source retention, reload, project round trips and undo.

Profile-based calibration, selectable barrel/pincushion direction, chromatic-aberration correction, EXIF-aware camera metadata and full Photoshop Lens Correction controls remain planned. This contract does not claim Photoshop equivalence.
