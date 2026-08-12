# `groupSlot.ts`

A group slot holds no clip, and Live still draws it as a launcher
colored by the first clip the group holds in that scene. Both answers come from clips
the snapshot already has, so the grid renders group slots without reading anything extra
out of Live — the LOM exposes them per slot, which is trackCount × sceneCount reads for
something already in hand. Member order is load-bearing: it decides which clip is
"first" and therefore what color the slot takes. `-1` means the group has nothing there
and is not a color; black is `0` and is.
