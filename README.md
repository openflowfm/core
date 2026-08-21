# core/

Pure domain logic. This is where the actual thinking goes, and the only module with
meaningful unit-test coverage.

**Docs mirror the source one-to-one: `core/src/X.ts` is explained in `core/docs/X.md`.**
So you don't need this table to find one — the path is predictable. **Read the row you
need, not the file.** Entries without a link are covered fully by their line here.

| file | | |
|---|---|---|
| [`color.ts`](docs/color.md) | palette RGB → hex, luminance, brightness, ink, legibility | |
| `livePalette.ts` | the checked-in 70-color Live table, in `color_index` order | |
| [`lomAtoms.ts`](docs/lomAtoms.md) | parsing for the atom shapes the LOM returns | ⚠ duplicated from `bridge/src/lom.ts` |
| [`pattern.ts`](docs/pattern.md) | token template evaluation + song-title parsing | |
| [`trackColumns.ts`](docs/trackColumns.md) | Live's flat track list → grid columns + group color bands | |
| [`groupSlot.ts`](docs/groupSlot.md) | what a group track's clip slot shows at one scene | |
| [`chords.ts`](docs/chords.md) | note names and key spelling for the chart's piano roll, and a chord reader **nothing currently calls** | ⚠ music is ambiguous; the reader declines |
| [`trackStatus.ts`](docs/trackStatus.md) | the playing clip → Live's track status display: loop pie, countdown, take length | ⚠ beats vs seconds |
| [`gridRange.ts`](docs/gridRange.md) | block selection + active-cell movement over the columns | |
| [`ops.ts`](docs/ops.md) | building clip writes, reversing them, and applying them | the undo story |
| [`roles.ts`](docs/roles.md) | scene roles: the `[role]` tag, and scene writes | |
| `songTags.ts` | open song-tag syntax + editor suggestions | |
| [`sceneTitle.ts`](docs/sceneTitle.md) | the rest of the scene name — `@{key} {SONG} - {ARTIST} {TAG}` | |
| [`defaultArtist.ts`](docs/defaultArtist.md) | safely fill blank artist facts across a set | |
| [`namePattern.ts`](docs/namePattern.md) | patterns that can be read back: format, parse, validate | the keystone of the scheme |
| [`derive.ts`](docs/derive.md) | the set → the mapping, by reversing the pattern | |
| [`setModel.ts`](docs/setModel.md) | the mapping → the shape everything consumes, derived once | the bridge holds it |
| [`songRows.ts`](docs/songRows.md) | songs → grid rows + song headers, and what folding hides | |
| [`chainWatch.ts`](docs/chainWatch.md) | which device runs anyone is watching, unioned across clients | |
| [`sceneMove.ts`](docs/sceneMove.md) | reordering scenes: the index arithmetic, so it's testable | ⚠ **can destroy work** |
| [`clipMove.ts`](docs/clipMove.md) | dragging clips: the copy order, so nothing is clobbered | |
| [`snapshotDelta.ts`](docs/snapshotDelta.md) | merging a partial re-read back in — clips by scope, rows by index | |
| `backstop.ts` | when the **bridge** should re-walk the set on its own initiative | ⚠ no doc; `shouldWalk` is cited from `bridge/docs/multiple-clients.md` |
| [`songOrder.ts`](docs/songOrder.md) | a running order of songs → the order the scenes go in | |
| [`colorRules.ts`](docs/colorRules.md) | a color per song, from a rule over the whole set | |
| `index.ts` | barrel | |

Run with `npm test` from the repo root. 588 tests.

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

## What belongs here next

Roughly the order it's coming:

- **Song segmentation** — grouping a flat scene list into songs. Needs a real answer
  for what marks a boundary in the actual set. Roles already give a scene a label; a
  song is the run of scenes that shares one.
- **Shape fingerprinting and template matching** — a song's scene×track occupancy
  matrix, clustered so one gesture assigns roles to a whole song positionally.
- **Scheme evaluation** — role→color map plus naming template, applied over a snapshot
  to produce a desired state.
- **Diff generation** — desired vs actual, as `(clip, field, before, after)` batches.
  Must record `before` values: that's what makes undo possible, since the LOM gives us
  none.
- **Lint** — anything that doesn't conform to the scheme, surfaced as a count.

All of these are pure functions over a `Snapshot`. That's the point.
