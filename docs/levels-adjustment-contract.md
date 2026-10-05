# Levels adjustment contract

PixelForge stores Levels as nondestructive metadata on each editable layer.
The existing input controls (`levelsBlack`, `levelsWhite` and `levelsGamma`)
map source channel values into a normalized tonal range. The output controls
(`levelsOutputBlack` and `levelsOutputWhite`) then map that corrected range
back into the requested output range. All five values are bounded, validated
and retained in local drafts and portable project files.

Rendering uses the same deterministic 8-bit mapping for raster, text and
vector layers:

1. Clamp a channel to the input black/white interval.
2. Apply the bounded midtone gamma.
3. Map the result between output black and output white.

Alpha is copied byte-for-byte. RGB bytes for fully transparent pixels are also
left untouched, so hidden source data survives edits and later mask changes.
The source asset is immutable; changing a slider creates an undoable metadata
revision. Output black must remain below output white, just as input black
must remain below input white. Legacy projects that omit output fields migrate
to `0` and `255` without changing rendered pixels.

The controls intentionally operate on the composite RGB channels together.
Per-channel Levels, histogram editing, 16/32-bit processing, linear-light
math, color management and true Photoshop adjustment-layer interchange remain
future milestones. The current contract has pure mapping/validation coverage
and desktop/mobile acceptance coverage for representative pixels, alpha,
source retention, undo, reload and project round trips.
