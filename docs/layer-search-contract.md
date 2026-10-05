# Find Layers contract

`Select > Find Layers` focuses the Layers panel search field. The search runs
entirely over bounded layer metadata: layer name, kind, group name, visibility
and lock state. Queries are trimmed, lower-cased and capped at 160 characters.
Name, kind and group-name terms use substring matching; the reserved `visible`,
`hidden`, `locked` and `unlocked` terms are exact state predicates. Thus
`hidden text` finds a hidden text layer, `visible` excludes hidden layers, and
`locked` does not match an unlocked layer.

Filtering never changes the active layer, selection, stack order, history or
saved draft. Group rows remain visible when one of their child layers matches;
an empty result displays a clear status message. Raster pixels and asset URLs
are never read or transmitted. The pure contract tests normalization,
multi-token matching, metadata fields, ordering and immutability. The desktop
acceptance test verifies menu focus, name/type/state searches, empty results
and preservation of the active selection.
