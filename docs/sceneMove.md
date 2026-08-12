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
