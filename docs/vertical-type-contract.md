# Vertical type contract

PixelForge text layers now support two persisted flow modes: `horizontal` and
`vertical`. Existing drafts omit the field and normalize to `horizontal`, so
bookmarks and cloud projects retain their prior appearance. The Type menu and
Layers panel expose both modes, and locked or non-text layers keep the commands
disabled.

Horizontal text retains the existing multiline alignment, line-height and
letter-spacing behavior. Vertical text lays each Unicode code point down a
column, advances glyphs by `fontSize + letterSpacing`, and starts each newline
in the next column with `fontSize × lineHeight` spacing. The source text,
font, color, transform and editable metadata remain intact; changing flow does
not rasterize or mutate any source asset.

The mode is validated against the finite `horizontal`/`vertical` enum and is
persisted in local drafts, project exports, reloads and optional cloud projects.
This is a deterministic canvas layout contract. Full OpenType vertical shaping,
vertical punctuation alternates, text-on-path, type masks and licensed font
providers remain separate roadmap work.

Required evidence includes pure validation/defaulting and glyph-position tests,
desktop/mobile menu and panel acceptance, representative pixel bounds,
lock/disabled-state coverage, undo/reload and project round trips.
