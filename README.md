# core/

Pure domain logic. This is where the actual thinking goes, and the only module with
meaningful unit-test coverage.

```
src/color.ts       palette RGB → hex, luminance, ink contrast
src/lomAtoms.ts    parsing for the atom shapes the LOM returns
src/pattern.ts     token template evaluation + song-title parsing
src/index.ts       barrel
```

Run with `npm test` from the repo root. 26 tests.

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

**If you change the helpers in `lom.ts`, change these too.** The duplication is a
known cost, accepted to get the tests.

**`color.ts`** — Live's palette spans near-white to near-black, so clip labels sitting
directly on the clip color need per-swatch contrast. `inkOn()` picks dark or light ink
by luminance.

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
