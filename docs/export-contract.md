# PixelForge image export contract

The image export dialog renders the current editable frame locally, then encodes a flattened copy as PNG, JPEG or WebP. It never uploads the source image. An editable `.pixelforge` project remains the recovery format because a rendered export cannot retain layers, masks, vector properties or undo history.

## Formats and fidelity

* **PNG** is lossless and preserves alpha. The quality control is hidden because it has no meaning for PNG.
* **JPEG** is lossy and always receives a white matte. Transparent pixels therefore become white. The browser's encoded MIME type is checked before download so a fallback PNG cannot be mislabeled as `.jpg`.
* **WebP** is encoded with the selected quality and supports transparency. Quality 100 is still not presented as a lossless guarantee. Unsupported WebP encoders fail visibly and leave the editable draft unchanged.

The dialog previews the actual encoded byte size before download. JPEG and WebP also accept an optional target size from 1 KB through 64 MB. When a target is present, PixelForge performs a bounded search over integer quality values and chooses the highest quality whose browser-produced blob fits. If even quality 1 is too large, the smallest valid blob is returned with an explicit “target not met” status; dimensions are never silently reduced. PNG remains lossless and has no target-size control. The filename uses the document name and the format extension. Exports contain only the rendered pixels; original EXIF/GPS metadata and source color profiles are not copied.

The selected format, lossy quality and optional target size are validated and saved with the local draft, then restored from a bookmark or after reload. Legacy projects without these optional fields default to PNG at quality 92 with no target. The preference is UI state; the document's pixels and editable history do not depend on it.

## Acceptance evidence

The desktop/mobile browser tests export all three formats and check PNG, JPEG and WebP signatures, check that WebP quality changes the encoded byte count, check the transparency disclosure, exercise the JPEG/WebP target-size search against actual downloaded bytes, assert the target preference survives reload, and check that rendered exports contain no EXIF/GPS marker. A browser that cannot encode WebP receives an explicit unsupported-format message rather than a corrupt download.

This contract does not claim metadata editing, batch export, ICC color management, HEIC/PSD output or Photoshop compatibility. Those remain later production-workflow milestones.
