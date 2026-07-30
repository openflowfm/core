# core/

Pure domain logic. This is where the actual thinking goes, and the only module with
meaningful unit-test coverage.

```
src/color.ts         palette RGB → hex, luminance, ink contrast, legibility
src/lomAtoms.ts      parsing for the atom shapes the LOM returns
src/pattern.ts       token template evaluation + song-title parsing
src/trackColumns.ts  Live's flat track list → grid columns + group headers
src/gridRange.ts     block selection + active-cell movement over the columns
src/ops.ts           building clip writes, and reversing them
src/index.ts         barrel
```

Run with `npm test` from the repo root. 86 tests.

## The one rule

**`core/` imports no transport, no React, and nothing Live-specific.**

No `ws`, no `max-api`, no `LiveAPI`, no DOM, no `fetch`, no `fs`. It may import types
from `protocol/`, nothing more.

Two reasons this matters:

1. **It's testable without Live running.** Everything else in this project needs
   Ableton open and a device loaded. `core/` runs in vitest in milliseconds, which is
   the only way the domain logic gets real coverage.
2. **It keeps the backend replaceable.** The long-term plan has Live as one possible
   backend, not the only one. Anything Live-specific that leaks in here has to be
   untangled later.

If a function needs to know *how* data arrives, it belongs in `bridge/` or `ui/lib/`.

## What's here now

**`pattern.ts`** — the naming half of the scheme. A pattern like
`{bpm} {key} {label} {role}` renders to `128 Bm Arp Jam 1`. Unresolved tokens are
dropped and whitespace collapsed, so a missing `{key}` can never write a literal
`{key}` into a clip name and never leaves a double space. `parseSongTitle` reads the
`{bpm} {key} {label}` convention the set already uses, returning empty fields rather
than guessing when a title doesn't match.

This is the piece that has to be provably right before it renames thousands of clips.

**`lomAtoms.ts`** — deliberately duplicated from `bridge/src/lom.ts`. That file can't
import anything (`module: "none"`), and this parsing is the part of the snapshot walk
most likely to be wrong, so it lives here to be testable. `parseId(['id', 0]) === 0`
is the occupancy test the entire slot scan hinges on.

Two of these exist specifically because collapsing "absent" into a valid value is how
this module has actually gone wrong. `parseObjectRef` separates *unreadable* from
*empty* — `parseId` reporting both as `0` is what let a broken slot scan claim a full
set had no clips. `parseNumOr` does the same for a value Live may answer with None: a
scene's `color_index` is documented as "Can be None for no color", and `parseNum`
would call that palette slot 0, a real color. When a LOM read has an "absent" case,
give it its own value rather than a plausible default.

**If you change the helpers in `lom.ts`, change these too.** The duplication is a
known cost, accepted to get the tests.

**`color.ts`** — Live's palette spans near-white to near-black, so clip labels sitting
directly on the clip color need per-swatch contrast. `inkOn()` picks dark or light ink
by luminance.

`legibleOn()` is the opposite case: a scene name *is* Live's color, painted on our
near-black panel, and Live's palette contains colors invisible there. It blends toward
white only as far as the contrast ratio demands, so the hue — the entire point of
showing Live's color — survives. Pure black is the terminating case.

**`trackColumns.ts`** — Live stores group membership as a parent link per track and
allows groups inside groups, so this walks the link rather than inferring structure
from track order. `buildColumns` drops a collapsed group's descendants at any depth
and replaces them with one column; `headerSpans` merges consecutive columns into the
group header row, always totalling the column count so the header can't drift out of
alignment with the grid. Only the immediate parent is shown — representing arbitrary
nesting needs a header row per level, which the grid doesn't have. Cyclic parent links
are guarded against rather than trusted, since a malformed one would hang the render.

**`gridRange.ts`** — shift-click and arrow-key movement, which look trivial and aren't.
Both work in *column positions*, never track indexes: a collapsed group removes its
members from the rendered columns, so a block from track 2 to track 30 must not silently
pick up the twenty hidden tracks in between, and `→` must step over them rather than into
them. `cellsInBlock` yields nothing when an endpoint isn't a visible column — a block
anchored to something you can't see isn't a block the user drew — while `stepCell` does
the opposite and rescues a stranded position, because getting unstuck matters more than
being principled about where it was.

`moveActive` wraps `stepCell` with the one case tests actually caught: the scene name
column sits left of every track column but isn't one of them, so `←` from the first track
has to land on the scene and `→` from the scene has to land back on the first track.

**`ops.ts`** — the first piece of the undo story, and it's here because the whole point is
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

## What belongs here next

Roughly the order it's coming:

- **Song segmentation** — grouping a flat scene list into songs. Needs a real answer
  for what marks a boundary in the actual set.
- **Shape fingerprinting and template matching** — a song's scene×track occupancy
  matrix, clustered so one gesture assigns roles to a whole song positionally.
- **Scheme evaluation** — role→color map plus naming template, applied over a snapshot
  to produce a desired state.
- **Diff generation** — desired vs actual, as `(clip, field, before, after)` batches.
  Must record `before` values: that's what makes undo possible, since the LOM gives us
  none.
- **Lint** — anything that doesn't conform to the scheme, surfaced as a count.

All of these are pure functions over a `Snapshot`. That's the point.
