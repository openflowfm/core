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
src/roles.ts         scene roles: the [role] tag, and scene writes
src/sceneTitle.ts    the rest of the scene name — {song} {bpm} {key}
src/index.ts         barrel
```

Run with `npm test` from the repo root. 165 tests.

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
`{key}` into a clip name and never leaves a double space.

This is the piece that has to be provably right before it renames thousands of clips.

It used to also carry `parseSongTitle`, reading `{bpm} {key} {label}`. The scene name
convention settled the other way round, so that was removed rather than left as a
second contradictory answer to "how do you read a title" — see `sceneTitle.ts`, which
is the one with callers. `{label}` remains a token you can supply a value for; nothing
parses it back out of a name.

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

**`roles.ts`** — what a scene is *for*: `intro`, `verse`, `chorus`, `jam`. One role per
scene, stored as a bracketed tag in the scene's own name:

```
Nightfall 128 Bm [chorus]
```

**The set is the storage, and that's the design.** Scenes have no stable id in the LOM,
so a sidecar file could only be keyed by index — which silently relabels everything below
an inserted scene — or by name, at which point the name is already the identity and the
file buys nothing. In the name, the role travels with the `.als` to the gig laptop and is
visible in Live itself.

**The tag is bracketed rather than a bare trailing word**, and this is the part worth
defending. The title's own last token is already spoken for — it's `{key}` — so
`Nightfall 128 Bm` versus a bare-word role is genuinely ambiguous. Worse, a bare word
could only be recognised by matching against the
vocabulary — so renaming a role from `jam` to `solo` would make every scene using it
silently roleless. A tag stays visibly *there* when its name is unknown, which is the
difference between a failure you can see and one that just loses data. `ROLE_CHARS` is
deliberately narrow for the same reason: a scene may carry brackets of its own
(`[alt mix/b]`), and only things shaped like role names are read as roles.

`roleKey` matches case-insensitively, so `[Chorus]` typed by hand in Live and `[chorus]`
written by us are one role rather than two entries with two colors. `mergeVocabulary`
unions the configured list with whatever is actually tagged in the set — a vocabulary
listing only what someone remembered to configure would hide a role typed straight into
Live and then fail to color it for no visible reason.

The scene-write half mirrors `ops.ts`, with one exclusion that's specific to scenes:
**a scene that had no color at all cannot be restored to having none.** Live documents
`Scene.color_index` as nullable and Max's LiveAPI can't construct that None to write it,
so `inverseSceneOps` drops the color revert rather than painting slot 0 over it — an undo
that leaves the scene a color it never had is worse than one that leaves it alone.
`countUnrevertableColors` exists so the caller can *say* so; an undo that quietly does
less than it claims is exactly what this module is written to avoid.

**`sceneTitle.ts`** — everything in a scene name *except* the role tag:

```
Nightfall 128 Bm [chorus]
└── song ──┘ │   └ role ┘     roles.ts owns the tag
     │       └ key
     └ bpm
```

Three optional parts in that order. `roles.ts` owns the tag, this owns what comes
before it, and `titleOps` composes them — it rewrites the title and puts the scene's
own role back on, so renaming a song across eighteen scenes doesn't disturb the roles
you assigned them.

**Parsing is anchored at the end and never guesses in the middle.** `bpm` and `key` are
recognised only as trailing tokens of exactly the right shape, so `Arp Jam 2` keeps its
whole title rather than having the `2` read as a tempo. The property that falls out and
is worth relying on: **parse and format round-trip.** A title this can't decompose comes
back byte-identical rather than rearranged, which is what makes it safe to run a patch
over a name nobody meant to restructure. There's a test per shape for exactly that.

`TitlePatch` distinguishes **absent from empty**, and that distinction is the feature:
an omitted field is left alone on every scene, an empty string clears that part.
Selecting two songs' worth of scenes to set one shared key must not flatten their
different names, so "don't touch this" has to be a different thing from "make this
blank". `commonTitle` is the other half — it reports `null` where the selection
disagrees, so a mixed field can say so instead of picking one scene's answer and quietly
spreading it over the rest.

One naming note: **`song` here means a piece of music, not Live's `Song`**, which is the
whole set — and `LaunchTarget { kind: 'song' }` in the protocol means the transport. The
overload predates this file (`pattern.ts` has a `{song}` token, the README talks about
song segmentation), so this follows the word already in use rather than inventing a
second one. If it's ever renamed it has to be renamed in all three places at once.

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
