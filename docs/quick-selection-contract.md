# Quick Selection contract

PixelForge's Quick Selection tool (`W`) is a deterministic, local selection
brush. It grows a canvas-sized alpha mask from the pointer samples by walking
4-connected pixels whose RGB channels remain within the configured tolerance of
the sampled colour. A stroke can contain up to 512 samples, each image is
bounded to the existing 16 MP safety limit, and each connected region is capped
at 2 million pixels. Transparent source pixels are skipped and the source
bytes are never mutated.

The resulting mask uses the existing Replace, Add, Subtract and Intersect
selection algebra. It is stored as a normal project asset, so undo, local
reload, bookmark recovery and private project round trips retain the selection
without uploading anonymous source pixels. Size, opacity and colour tolerance
are draft settings and the tool supports mouse and touch pointer gestures.

This is an edge-aware colour-growth approximation. It does not infer semantic
objects, faces, subjects or skies, and it does not claim parity with Adobe's
inference-backed Quick Selection/Object Selection engines. Large or highly
textured images may stop at the bounded region budget; the UI keeps the
limitation visible and users can continue with another sample or use Selection
Brush, Color Range or Magic Wand for a different mask strategy.
