# Dodge, Burn and Sponge contract

PixelForge's Dodge, Burn and Sponge tools are local, undoable raster commands.
Each pointer gesture decodes the selected raster asset into an immutable source
and a private destination buffer, applies bounded radial coverage along the
stroke, then commits one new asset. The original asset remains available to
undo/redo and is included in local/project round trips.

## Pixel behavior

- Dodge moves RGB channels toward white; Burn moves them toward black.
- Exposure and flow are normalized amounts and are multiplied by radial
  coverage. Shadows, midtones and highlights use deterministic luminance range
  weights so a stroke can be targeted without changing alpha.
- Sponge supports Saturate and Desaturate. Its vibrance amount raises or lowers
  HSL saturation while preserving hue, lightness and alpha.
- Fully transparent pixels are skipped, including hidden RGB bytes. Opaque and
  partially transparent pixels retain their original alpha byte.
- Hard and soft radial masks are clipped to canvas bounds and stroke segments
  are sampled at bounded intervals. Replaying the same source/destination and
  settings returns identical bytes.

## Interaction and persistence

`O` cycles Dodge, Burn and Sponge; `Shift+O` cycles in reverse. Tool state,
size, hardness, flow, exposure, tonal range, sponge mode and vibrance are
validated in drafts and restored after bookmark/reload. Locked, hidden and
non-raster layers reject strokes. Pointer cancellation restores the last
committed frame without adding history. Desktop and mobile acceptance tests
cover toolbar and shortcut activation, representative pixel/alpha changes,
settings persistence, undo/redo, lock guards and touch cancellation.

The implementation intentionally remains a baked raster command rather than a
Photoshop adjustment layer. Non-destructive tonal command metadata and
pressure-sensitive exposure are separate roadmap work.

