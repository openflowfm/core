# `ops.ts`

The first piece of the undo story, and it's here because the whole point is
that it's provable without Live. `inverseOps` turns a batch about to be written into the
batch that puts it back, reading "before" out of the snapshot rather than asking Live —
which is free, since a snapshot already holds every clip's name and color.

Three exclusions carry the weight, and each is a way undo could otherwise do damage of its
own: a cell with no clip in `before` (`apply` skipped it, so there's nothing to restore and
a name write there would fail), a field the op never wrote (reverting an untouched color
would be a destructive undo), and a write that changed nothing. That last one makes an
empty result *meaningful* — it says the write had no effect to undo, not that undo failed.

`colorOps` applies the same filter forward: recoloring a scene where 22 of 30 clips are
already that color should write 8, not 30. A progress bar reporting work that isn't
happening is a lie about cost.

`applyOps` runs the batch the *other* way — the clips as they'll read once the write has
landed — and it exists so a write doesn't have to be followed by re-walking the set. A
full walk is tens of thousands of LOM reads; a rename changes one string, and the caller
already knows which. `applySceneOps` in `roles.ts` and `applyClipMove` in `clipMove.ts`
are the same idea for scenes and for a drag.

**All three are only sound when the operation fully succeeded**, and the honesty is in the
caller. Live reports how many ops it took, never *which*, so a partial write cannot be
reproduced from here and none of these tries — the UI compares `applied` against what it
sent and re-reads the set when they differ. Optimism is safe exactly as far as that check
goes and no further.

Two details that would otherwise be guesses. `applyOps` takes an `rgbFor` callback rather
than a palette, because a clip's color goes to Live as an index but is drawn from RGB, and
core has no palette and shouldn't grow one. `applySceneOps` needs no such thing — a scene
op already carries the RGB next to the index, that being the only form Live accepts for a
scene at all.
