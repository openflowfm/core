# `gridRange.ts`

Shift-click and arrow-key movement, which look trivial and aren't.
**Both axes work in rendered positions, never in indexes.** `columns` is the visible
track indexes, `rows` the visible scene indexes. A collapsed group removes its tracks
from the columns and a collapsed song removes its scenes from the rows, so a block from
track 2 to track 30 must not silently pick up the twenty hidden tracks between them — and
a block from scene 5 to scene 90 must not pick up the folded song sitting between those.

The symmetry is the point, and it isn't cosmetic: **`⌘↓` walking `rows` is what stops the
sweep descending into scenes you can't see and firing them**, which is the one thing the
⌘-makes-a-sound rule exists to keep predictable.

`cellsInBlock` yields nothing when an endpoint isn't visible on either axis — a block
anchored to something you can't see isn't a block the user drew — while `stepCell` does
the opposite and rescues a stranded position, because getting unstuck matters more than
being principled about where it was. Vertically it rescues to the *nearest* visible row
in the direction of travel rather than to the end of the set, so collapsing the song
you're sitting in feels like a fold rather than a jump.

`moveActive` wraps `stepCell` with the one case tests actually caught: the scene name
column sits left of every track column but isn't one of them, so `←` from the first track
has to land on the scene and `→` from the scene has to land back on the first track.
