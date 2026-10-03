# `sceneMove.ts`

The one operation in this project that can destroy work, reduced
to arithmetic so it can be proved without Live.

Live has no scene-move call (`bridge/LOM.md`), so a move is build-then-delete: create
blanks at the destination, `duplicate_clip_to` every occupied slot across, carry the
scene's own properties, delete the originals. **Step one renumbers the set underneath
you** — inserting n blanks pushes every index at or after the destination up by n — so
the scenes you delete are not at the indexes you found them at. Get that wrong and it
deletes the wrong scenes, and unlike a rename there is no snapshot to restore from.

Three things follow:

- **The plan says which scene to copy from and to, never *what* to copy.** `lom.ts`
  reads the properties off the source object at move time, so the move carries fields
  the snapshot doesn't even model — `time_signature_numerator` and friends — and can't
  be caught out by a stale snapshot. Keeping the field list here would also put
  Live-specific knowledge in `core/`, which is the one rule.
- **Deletions are emitted descending.** Each one renumbers everything below it, so
  highest-first means the remaining indexes are still the ones they were computed
  against.
- **A move that reorders nothing returns `null`, not an empty plan.** Dropping a song
  back where it already was is how a drag usually ends, and the cheapest way to never
  delete a scene by accident is to not run.

The tests **replay** each plan against a model of the set and assert the resulting
order, rather than asserting the plan's fields — a field assertion only proves the
implementation matches itself. One case is exhaustive over every source run and every
drop position in a seven-scene set, checking the result is always a permutation:
nothing lost, nothing duplicated, no blank left unfilled.

Non-contiguous sources work, which is what lets a song found in two blocks be gathered
in one gesture.

`planSceneReorder` answers the other question: not "put this run there" but **"here is the
order I want"**, as one plan. A set list is reordered by pushing ten songs around, and
doing that a drag at a time is ten create/copy/delete passes, ten round trips and ten
re-snapshots — plus ten separate entries in Live's undo history, with a half-applied order
as the failure mode in between.

**Only the scenes that have to move, move.** The longest increasing subsequence of the
wanted order is the largest set of scenes already in the right relative order, so those are
left exactly where they are and the rest are rebuilt around them. Moving one song out of a
hundred therefore costs what dragging it costs. The naive version — copy all n scenes to
the end, delete the originals — is four lines and correct and copies every clip in the set.

The blanks stay one contiguous group per gap and are emitted in ascending position, so no
`create_scene` renumbers a blank already made and every copy's destination can be stated as
a plain index up front. Where each *original* ends up is computed by merging rather than by
arithmetic: the blanks' final indexes are their create indexes, so the originals fill what's
left, in order.

The test is the same replay, taken to its limit: **every permutation of a set of up to six
scenes** — 873 of them — has to land on exactly the order asked for, with the blanks
ascending and as many deletions as creations.

An order that isn't a permutation of the set **throws**. It can only be our own bug, and a
plan built from a half-correct order would delete scenes it never copied. The UI catches
it rather than letting it land mid-render.

## `planSceneKeep`

The new-show workflow asks a third question: **"tonight is these songs, in this order —
and nothing else."** The user types the running order, reorders it, and commits; the kept
scenes go into that order and every other scene in the set is deleted, as one plan sent as
one bridge message (`keepScenes`, carrying `OpenFlow.KeepPlan`). This is the plan that
deletes the most, routinely most of the set, so it is the one where the arithmetic matters
most.

It is `planSceneReorder` with an order that covers only part of the set, and it runs on
the same code: both call one private `rebuild`, so a fix to one is a fix to both and a
test of the reorder exercises the keep. The anchors are still the longest increasing
subsequence of the order, and they still stay exactly where they are. The other kept
scenes are copied into blanks placed after the anchor they follow. **Dropped scenes are
deleted and never copied** — copying a scene only to delete both copies would be the most
expensive way to do nothing. Whichever side of a blank a dropped scene happens to sit on
makes no difference, because it isn't there afterwards.

So `remove` is every original that isn't an anchor: the moved scenes' originals and the
dropped scenes together, in post-insert numbering, descending, built from the same merge
that places the originals around the blanks, so it can never name a created blank. That
is also why `keep === sceneCount + create.length - remove.length` holds by construction:
each moved scene adds one blank and removes one original, each dropped scene removes one
original, and what's left is `order.length`.

A plan the bridge receives has to pass the bridge's own checks before anything runs —
blanks strictly ascending, deletes unique and strictly descending and in range, every copy
landing in a blank, every copy's source in `remove`, at least one scene left. The planner
guarantees all of them, and the bridge checking again is the point: a plan that slips
through deletes scenes.

`null` means only one thing: the order is the whole set, already in place. Keeping every
scene in place but dropping one is not nothing — it's a deletion — so it gets a plan with
no blanks and no copies. An order that is empty, repeats a scene, or names one out of
range **throws**, for the same reason as the reorder.

The test is the reorder's replay widened to match: **every ordering of every subset of a
set of up to six scenes** — 2,365 of them — has to replay (create, then copy, then the
descending deletes) to exactly the kept scenes in the kept order, and each plan has to
pass every check above, copy only kept scenes, and move exactly `order.length` minus the
longest increasing subsequence — checked against a second, quadratic implementation of it.
Over full permutations it must also agree step for step with `planSceneReorder`.

`describeKeep` says what the commit costs in the same voice as `describeMove`:
`3 scenes moved · 42 clips copied · 18 scenes deleted`. "Deleted" counts the scenes that
are gone afterwards, not the originals of the moved ones — those are deleted too, but what
the user sees is a scene that moved.
