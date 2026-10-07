# Ripple effect contract

PixelForge's Filter → Distort → Ripple command is a local, nondestructive radial displacement. It stores the validated `filterEffects` record on the selected layer and never replaces the immutable source asset.

- `amount` is a bounded 0–100 strength.
- `radius` is a bounded 0–64 wavelength/displacement control.
- `centerX` and `centerY` are normalized 0–1 controls exposed in the inspector.
- Each destination samples the immutable source with premultiplied-alpha bilinear interpolation. Destination alpha remains byte-identical and fully transparent RGB padding cannot bleed into visible pixels.
- The effect is deterministic, undoable, reloadable and included in project JSON. It makes no semantic or generative claim.

Coverage includes deterministic pixel behavior, source immutability, centre sensitivity, transparent-edge safety, metadata validation, menu enablement, inspector controls, project round trip and undo on desktop and mobile acceptance surfaces.
