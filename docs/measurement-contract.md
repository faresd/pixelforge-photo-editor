# Sampling and measurement contract

PixelForge's Sampling and Measurement tools are workspace overlays. Eyedropper
changes the foreground color; Color Sampler stores an exact rendered RGB/alpha
sample; Ruler stores pixel distance and angle; Note stores a bounded plain-text
annotation; and Count adds sequential numbered markers. All four annotation
types are kept on the editable frame, survive local/project reloads and remain
undoable. They are omitted from PNG, JPEG, WebP and batch exports so an
annotation cannot accidentally become image content.

Coordinates are validated against the frame dimensions and capped at 512
annotations. Note text is capped at 500 characters and rejects control bytes.
Ruler geometry uses Euclidean pixel distance and a signed degree angle rounded
to one decimal place. Color Sampler reads the rendered composite, including
the current layer stack and masks, without mutating source assets.

The pure test contract covers exact color/alpha capture metadata, ruler
distance and angle, sequential Count indices, coordinate bounds, note safety,
and malformed records. Desktop and mobile browser tests cover real pointer
gestures, prompt-backed notes, project download and reload persistence. The
overlay is deliberately pointer-transparent and rendering-independent so image
exports remain pixel-identical.
