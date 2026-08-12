# `snapshotDelta.ts`

Merging a partial re-read of the set back into the snapshot in
hand. The bridge follows edits made in Live by watching the Session cursor and re-reading
only the tracks it touches (`bridge/README.md`, *Following Live*); this is the half that
has to be right for that to be worth doing.

**Scope-then-replace, never upsert by `(t, s)`** — and that distinction is the entire
reason this is a function in `core/` rather than three inline lines in a hook.

An upsert carries over a clip that is no longer there: a deleted clip has no entry in the
incoming payload, so nothing overwrites it and the stale copy survives. **A clip moved out
of a slot is a deletion at the source**, so a merge that can't represent deletion doesn't
merely miss the change — it draws the clip in two places at once, which is the exact
failure the re-read exists to prevent.

So the scope is authoritative in both directions. Whatever the payload says about those
tracks is the complete truth about them, *including saying nothing at all*: an emptied
track is a scope entry with no clips, not a missing entry. Clips arriving from outside the
declared scope are dropped rather than trusted, because nothing would ever replace them —
a later delta only rewrites its own scope, so an out-of-scope clip is uncorrectable once
admitted.

`canApplyDelta` is the other half: revisions are a monotonic counter owned by `lom.ts`, and
a delta may only be applied to the exact revision it was computed against. A mismatch is a
missed message rather than an error, so the answer is a full walk, not a retry.
