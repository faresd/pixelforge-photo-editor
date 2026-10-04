# Brush Presets contract

PixelForge now provides a small, deterministic local Brush Presets control for
the Brush and Pencil tools. The panel is intentionally bounded: a preset is a
validated settings bundle and never a pixel payload, executable plugin, font,
or remote URL. Anonymous drafts remain free and continue to save locally.

The built-ins are **Round hard**, **Round soft**, **Pencil**, and **Ink angled**.
Each preset sets size, hardness, spacing, angle, roundness, tip mirrors and the
two opt-in pressure flags. Choosing a preset updates only future strokes; it
does not rerender an existing asset or create a history entry. The selected
id and resulting settings are included in the normal draft/project round trip.

Tip values are validated before rendering: size is 1–10,000 px, hardness and
roundness are 0–100/1–100 percent, spacing is 1–100 percent, angle is
-180–180 degrees, and mirror/pressure flags are booleans. Unknown ids and
oversized labels fail closed. The renderer uses the same bounded local
ImageData mask as Brush, Eraser, Clone, Healing and Pattern Stamp.

The panel deliberately does not present Photoshop-equivalent claims for
scattering, texture, dual brush, color dynamics, transfer, pose, noise, wet
edges, build-up, protect texture, mixer media, or custom imported brush files.
Those features require a measured worker/tile renderer and a separate privacy,
quota and cancellation contract. They remain roadmap items rather than silent
no-op controls.

Acceptance coverage includes pure bounds/identity validation, deterministic
elliptical and rotated tip masks, preset selection and local persistence, and
desktop/mobile browser checks for control visibility, project export and
reload-safe settings.

