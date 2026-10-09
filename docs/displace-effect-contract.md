# Displace filter contract

Pixel's first Displace slice is a deterministic procedural displacement field. A pair of bounded sinusoidal fields, rotated by the editable direction, inverse-samples the immutable source with premultiplied-alpha bilinear interpolation. Destination alpha and transparent RGB remain source-safe, and the editable metadata survives drafts and project files.

The effect stores `filterEffects.type = displace` with bounded amount, radius (wavelength), angle, centre and seed metadata. Displacement is clamped at the image bounds and never expands the canvas. This makes the first stage predictable and offline; it is not a user-supplied grayscale displacement-map workflow.

Unit tests cover deterministic field sampling, identity controls, direction changes, edge clamping, transparent-source exclusion and detached buffers. Desktop/mobile acceptance covers menu activation, editable wavelength/direction, representative pixel changes, source retention, reload, project round trips and undo.

User-supplied maps, map-channel selection, wrap modes, geometric expansion and Photoshop's full Displace dialog remain planned. This contract does not claim Photoshop equivalence.
