# PixelForge image export contract

The image export dialog renders the current editable frame locally, then encodes a flattened copy as PNG, JPEG or WebP. It never uploads the source image. An editable `.pixelforge` project remains the recovery format because a rendered export cannot retain layers, masks, vector properties or undo history.

## Formats and fidelity

* **PNG** is lossless and preserves alpha. The quality control is hidden because it has no meaning for PNG.
* **JPEG** is lossy and always receives a white matte. Transparent pixels therefore become white. The browser's encoded MIME type is checked before download so a fallback PNG cannot be mislabeled as `.jpg`.
* **WebP** is encoded with the selected quality and supports transparency. Quality 100 is still not presented as a lossless guarantee. Unsupported WebP encoders fail visibly and leave the editable draft unchanged.

The dialog previews the actual encoded byte size before download. This is an estimate of the final browser-produced file size, not a target-size guarantee. Image dimensions are not silently reduced. The filename uses the document name and the format extension. Exports contain only the rendered pixels; original EXIF/GPS metadata and source color profiles are not copied.

The selected format and lossy quality are validated and saved with the local draft, then restored from a bookmark or after reload. Legacy projects without these optional fields default to PNG at quality 92. The preference is UI state; the document's pixels and editable history do not depend on it.

## Acceptance evidence

The desktop/mobile browser test exports all three formats and checks PNG, JPEG and WebP signatures, checks that WebP quality changes the encoded byte count, checks the transparency disclosure, and reloads to confirm the selected WebP/quality preference. A browser that cannot encode WebP receives an explicit unsupported-format message rather than a corrupt download.

This contract does not claim target-byte compression, metadata editing, batch export, ICC color management, HEIC/PSD output or Photoshop compatibility. Those remain later production-workflow milestones.
