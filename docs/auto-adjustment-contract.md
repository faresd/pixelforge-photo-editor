# Auto adjustment contract

PixelForge's Image > Auto Tone, Auto Contrast and Auto Color commands are local, nondestructive corrections. They store three validated boolean flags on the active layer and recompute the visible result from the immutable source asset. No generated pixels, source bytes or metadata are uploaded or embedded in the draft.

## Algorithms

- **Auto Tone** finds the minimum and maximum value independently for red, green and blue among pixels with alpha greater than zero, then linearly maps each channel range to 0–255. A channel whose span is 0 or 1 is left unchanged.
- **Auto Contrast** finds the minimum and maximum Rec. 709 luminance (`0.2126R + 0.7152G + 0.0722B`) among visible pixels and maps each RGB channel through that one range. A luminance span of 0 or 1 is an identity.
- **Auto Color** applies gray-world gains. It computes visible channel means, targets their average, and scales each channel by target/mean. A zero-mean channel has gain 1. Values are rounded and clamped to 0–255.

All three operations use the fixed order Tone, Contrast, Color when several flags are enabled. Fully transparent pixels keep their hidden RGB bytes and alpha is never changed. Each helper validates a complete RGBA `Uint8ClampedArray`, rejects buffers larger than 16 megapixels and returns a detached result without mutating its input. Uniform images are identities for Auto Tone and Auto Contrast; Auto Color is an identity when the visible channel means are already balanced. Fully transparent images are deterministic no-ops.

## Document and interaction behavior

The flags are part of `Adjustments`, default to false for older v2 documents, validate as exact booleans and survive local autosave, bookmark recovery, project export/import and optional cloud transport. Applying a correction creates one undoable layer edit only when the source contains a usable range. Repeating an already enabled command is a no-op. Locked, hidden, missing and non-raster active layers keep the menu command disabled and report an accessible reason when invoked programmatically. `Shift+Ctrl+L` invokes Auto Tone; all three commands are available from the Image menu.

The renderer applies automatic corrections after the existing filter, hue, levels, color-balance, sharpen/noise and curves stages and before layer masking/compositing. Source assets remain editable and reset clears the flags. Rendering, export and reload use the same pure byte algorithm.

## Required evidence

Pure tests cover cast/range fixtures, flat and empty images, alpha and transparent hidden RGB preservation, immutability, deterministic replay, combined ordering, bounds and malformed buffers/metadata. Browser tests cover each menu item, shortcut, representative pixels, source-asset identity, undo/redo, lock/visibility scope, mobile pointer-safe menu access, local reload and project round trips. Release CI must run these focused tests together with the full desktop/mobile suite and verify the live revision.
