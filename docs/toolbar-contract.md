# Compact toolbar and tool-family contract

The left palette keeps every implemented tool reachable in a compact two-column
layout, expanding to three columns on wide editor viewports. Tools are grouped
under Navigate, Measure, Marquee, Lasso, Selection, Crop & Slice, Retouch,
Paint & Fill, and Draw & Type headings. The grouping is presentation metadata;
it does not hide a tool or change its persisted `Tool` identifier.

Tool buttons with Photoshop-style subtools expose `aria-haspopup="menu"`. A
pointer or touch press held for 420 ms opens a flyout without selecting the
parent tool. Releasing a short press selects the button normally. Flyout items
are ordinary menu buttons, retain the existing tool IDs and shortcuts, and can
be activated by touch, mouse or keyboard. Escape closes an open flyout.

Repeated Photoshop keys continue to cycle the existing keyboard families:
`M` marquee, `L` lasso, `W` selection, `C` crop, `G` fill, `B` paint, `U`
shapes, `I` measurement, `E` eraser, `O` tonal, `S` stamp, and `J` healing.
The Selection flyout presents the current Selection Brush implementation as
the Quick Selection equivalent beside Magic Wand, while the main toolbar keeps
the precise Selection Brush label and its legacy `L` keyboard behavior.

Coverage lives in `src/toolPalette.ts`, `tests/tool-palette.test.mjs`, and the
desktop/mobile `tests/browser/toolbar-layout.spec.ts` acceptance tests. The
tests assert category completeness, family cycling, flyout keyboard aliases,
hold-to-open behavior, Escape dismissal and preservation of two/three-column
touch targets.
