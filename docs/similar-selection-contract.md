# Local Similar Selection contract

PixelForge's **Select → Similar** command is a local, nondestructive colour
selection. It requires an active visible selection, renders the current
document locally, computes a premultiplied-alpha weighted average RGB seed from
the selected pixels, and applies the bounded Color Range channel-distance mask
to the full rendered composite. The operation never uploads source pixels or
changes layer assets.

The current selection mode (replace, add, subtract or intersect) is preserved
through the normal selection-composition algebra. Fuzziness uses the existing
0–255 bounded Color Range control and the resulting canvas-sized alpha mask is
stored as an editable project asset. Empty or fully transparent seeds fail
closed without changing the document. Undo, local draft reload and project
export/import retain the selection mask and its alpha values.

Pure tests cover weighted seed calculation, exact and soft matching,
transparent pixels, immutable inputs, empty seeds and malformed dimensions.
Desktop/mobile acceptance covers disabled/enabled menu state, representative
selection output, persistence and reload. This is a deterministic local
colour-similarity primitive; semantic object, focus-area and subject inference
remain separate staged capabilities.
