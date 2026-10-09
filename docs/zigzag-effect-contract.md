# ZigZag filter contract

Pixel's first ZigZag slice is a deterministic, nondestructive radial sinusoidal displacement. The source is sampled through a premultiplied-alpha bilinear inverse map, with a smooth falloff toward the bounded influence edge. Destination alpha and transparent RGB stay source-safe, and the immutable raster asset is retained.

The effect stores `filterEffects.type = zigzag` with bounded amount, radius (wavelength), centre and seed metadata. Radius controls the radial wavelength; amount controls displacement strength. Coordinates clamp to the source canvas, so this slice does not expand the document or expose Photoshop's geometric canvas options.

Unit tests cover deterministic radial displacement, identity controls, edge clamping, transparent-source exclusion, detached buffers and malformed dimensions. Desktop/mobile acceptance covers menu activation, editable wavelength, representative pixel changes, immutable assets, reload, project round trips and undo.

Editable amplitude profiles, polar/rectangular options, canvas expansion and full Photoshop ZigZag controls remain planned. This contract does not claim Photoshop equivalence.
