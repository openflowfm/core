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
src/sceneTitle.ts    the rest of the scene name — @{bpm}-{key} {SONG}
src/namePattern.ts   patterns that can be read back: format, parse, validate
src/derive.ts        the set → the mapping, by reversing the pattern
src/songRows.ts      songs → grid rows + song headers, and what folding hides
src/sceneMove.ts     reordering scenes: the index arithmetic, so it's testable
src/index.ts         barrel
```

Run with `npm test` from the repo root. 250 tests.

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

**`songRows.ts`** — the row-wise mirror of `trackColumns.ts`, and deliberately shaped
like it: one folds columns into a group header, this folds rows into a song header.

**A header goes above each *block*, not each song.** A song is a label rather than a
range, so its scenes can come in several runs, and heading only the first would leave the
second run visually attached to whatever song precedes it — the opposite of segmenting
the grid. **Collapsing, though, is keyed by song**: folding "Nightfall" folds all of it,
reprise included. Two blocks then show two headers, which is honest, because the set
really does contain that song twice.

The header also carries the song's **color**, as `colorIndex` plus `colorClash`. Two
fields rather than one because "uncolored" and "colored inconsistently" are different
answers and only one of them is worth reporting: a header that showed the first scene's
color while the rest of the block disagreed would be a confident lie.

Every field on `SongHeader` is a primitive, including the facts, which arrive as rendered
strings (`128`, or `128 / 130` when the scenes disagree) rather than as the observed
arrays. That's the same constraint `marksByScene` obeys: the header crosses into a
memoized React row, and an object or array prop would re-render every header in the set
on each change.

An unmapped scene belongs to no song, so nothing can fold it away and leave it
unreachable — there's a test for exactly that.

**`sceneMove.ts`** — the one operation in this project that can destroy work, reduced
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
[CHORUS] @128-Bm NIGHTFALL
```

**The set is the storage, and that's the design.** Scenes have no stable id in the LOM,
so a sidecar file could only be keyed by index — which silently relabels everything below
an inserted scene — or by name, at which point the name is already the identity and the
file buys nothing. In the name, the role travels with the `.als` to the gig laptop and is
visible in Live itself.

**The tag is bracketed rather than a bare word**, and this is the part worth defending.
A bare word could only be recognised by matching against the vocabulary — so renaming a
role from `jam` to `solo` would make every scene using it silently roleless. A tag stays visibly *there* when its name is unknown, which is the
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

**`tempoOps` is the one write in here that changes how the set sounds.** Everything else
renames or recolors; a scene with its own tempo enabled changes the *song* tempo the
moment it fires. It's a separate op from the `{bpm}` name token for exactly that reason —
folding it into a rename would make a naming pass quietly alter playback. Below
`MIN_TEMPO` means "clear it", which is also the way back out after turning it on.

Unlike color, **tempo reverses cleanly in both directions**: "follows the song" is a state
Live will accept a write for, where "no color" is not. So turning a tempo on is fully
undoable and there's no counterpart to `countUnrevertableColors`.

**`sceneTitle.ts`** — everything in a scene name *except* the role tag:

```
[CHORUS] @128-Bm NIGHTFALL
 └ role┘  │   │  └ song ┘     roles.ts owns the tag
          │   └ key
          └ bpm
```

Three optional parts in that order. `roles.ts` owns the tag, this owns what follows it,
and `titleOps` composes them — it rewrites the title and puts the scene's own role back
on, so renaming a song across eighteen scenes doesn't disturb the roles you assigned them.

**Role first, facts second, name last**, so a column of scene names reads as structure
rather than as a list of titles. The cost is real and worth knowing: Live's own narrow
scene column now truncates the *name* rather than the metadata. Our grid lifts the role
into a chip, so it only bites in Live.

**Two characters do all the delimiting, and neither is decoration.** `@` opens the facts
from the front — it can't appear in `ROLE_CHARS` and won't start a title, so the group is
identifiable before you've read any of it, which is what makes a closing bracket
unnecessary. `-` joins bpm to key and **drops with whichever is missing**, because after
the `@` a digit begins a bpm and a letter begins a key: `@128-Bm`, `@128` and `@Bm` are
all distinguishable with nothing further. That asymmetry with the role's brackets is
deliberate — a role is recognised by *vocabulary* and so must stay visible when its name
is unknown; a fact is recognised by *shape* and can't fail the same way.

**Parsing is anchored at the front and never guesses in the middle.** The facts are read
only from a leading `@` group, so `Arp Jam 2` keeps its whole title rather than having the
`2` read as a tempo, and `Em Dash` keeps its whole title rather than having `Em` read as a
key. The property worth relying on: **parse and format round-trip**, modulo case. A title
this can't decompose comes back with only its capitalisation changed rather than
rearranged, which is what makes it safe to run a patch over a name nobody meant to
restructure. There's a test per shape for exactly that.

**The song is written in caps and read case-insensitively.** `songKey` already folds case,
so `NIGHTFALL` and `Nightfall` are one song and the uppercase is presentation rather than
identity — which is exactly what stops the convention change from splitting the library in
two while a set is half-converted.

`parseTitle` also still reads the **old** convention's trailing `128 Bm`. That's the
migration path: a set named the previous way keeps showing its facts, and any rename
converts it rather than flattening the bpm and key into the title. A no-op patch is
therefore not a no-op rename on an old-convention scene, which is the one gesture that
moves a scene onto the new convention without changing what it says.

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

**`namePattern.ts`** — the keystone of the declarative scheme (issue #1), and the
generalisation `sceneTitle.ts` is a hand-written special case of. A pattern compiles
into a formatter, a parser, and a verdict on whether it was safe to compile at all.

**The parser is the point.** Writing names is easy; the scheme rests on being able to
look at `[CHORUS] @128-Bm NIGHTFALL` six months later and recover which song and role it
belongs to with nothing stored on the side. That's what lets the mapping live in the set,
need no ids, and travel with the `.als`.

Two kinds of ambiguity, and **only one is fatal**:

| | | |
|---|---|---|
| **Undecidable** | `{song} {label}` | Two free fields, whitespace between. "Glass Tunnel Arp" splits three ways and nothing says which. Rejected. |
| **Resolvable** | `{song} {bpm?}` | "Nightfall 128" is a song called that, *or* a song at 128. Both real, one obviously meant. Allowed, under a stated rule. |

The rule for the second is **a name is read as filling as many parts as it can**,
implemented by matching the free token lazily. That's why `{song} {label}` is rejected
where `{song} {bpm?}` isn't, and it's the distinction to keep hold of — "ambiguous"
alone would have rejected both.

Note the separator, not the count, is what makes two free tokens fatal:
`{song} - {label}` is fine, because `" - "` says where the split is.

**The probe is the validator, and that's deliberate.** Structural checks catch the
undecidable cases and give them messages you can act on. Everything else is settled by
*measuring*: format sample values through the pattern, parse them back, require they
survive. So this file needs no complete theory of when a pattern is reversible — only an
honest test — and a pattern shape nobody anticipated fails loudly at definition time
rather than quietly at apply time.

Two things follow, both load-bearing:

- **Every token carries two samples**, and the second one earns its place. `{song}
  {role}` round-trips perfectly for `Nightfall`/`chorus` and breaks for `Glass Tunnel`/
  `post chorus` — one sample would have waved it through. That test is also the formal
  justification for `[{role}]` having brackets at all.
- **The probe judges reversibility, not taste.** `{song} [{role?}] {bpm}` writes
  `Nightfall] 128` when the role is absent, which is ugly and *does* round-trip, so it's
  allowed. A pattern its author regrets is their problem; one the app can't read back is
  ours.

### Optional groups

`( … )?` marks a run that appears together or not at all, carrying its own delimiters
with it. It exists because the rule an optional *token* follows — take the literal before
you, and the one after you only at the very end of the pattern — **cannot express a
bracketed field in the middle of a name**. `[{role?}] {song}` formats a role-less scene
as `] NIGHTFALL`: the opening bracket leaves with the token and the closing one is
stranded. Every convention that puts the title last needs this.

Inside a group, a literal with a token on **both** sides is a *separator* and survives
only while both sides do; a literal at the group's edge stands as long as the group does.
That one rule is what makes `@128-Bm`, `@128` and `@Bm` fall out of a single pattern
rather than three.

Groups don't nest. One level covers everything the scheme needs, and a nested version
would need a story for what a half-present inner group means that nobody has a use for.

Two smaller decisions worth not re-litigating:

- **`(` only opens a group when there's a matching `)?`.** Otherwise it's a literal,
  which is what lets `{song} (live)` work without this file inventing an escape syntax.
- **A space next to a group compiles to `\s*`, and only next to a group.** The group can
  vanish, and then there's nothing for the space to sit between. Relaxing *every* space
  breaks a pattern whose tokens are all required — `{song} {role}` with a lazy `{song}`
  reads "Nightfall chorus" as song `N` and role `ightfall chorus` the moment the space
  between them stops being mandatory. There's a test holding that down.

### Reading more than one convention

`derive` takes a list of patterns and reads each name with **whichever gets the most out
of it** — not the first that matches. That's forced rather than chosen: every scene
pattern is *total*, because `{song}` is free and everything else optional, so any pattern
matches any name by swallowing it whole. First-match-wins would consult only the first
entry, and the current convention would read `Nightfall 128 Bm [verse]` as one long song
name.

Counting fields is the same rule the pattern language already applies *within* a pattern
— a name is read as filling as many parts as it can — lifted one level. Ties go to the
earlier pattern, so the current convention wins a genuine ambiguity.

This is what makes a convention change survivable at all. The mapping lives in the names,
so switching patterns outright would make every scene in an already-named set unmapped at
once: the songs would vanish from the grid and there would be nothing left to select in
order to rename them. Instead a set converts scene by scene, and a half-converted song
still collects into one entry because song identity folds case.

`parse` returns `null` rather than a partial result. During the mapping pass `null` is
the common and correct answer — this scene isn't named by the scheme yet — while a
half-read name would attach a scene to the wrong song.

**`derive.ts`** — the other half of the trick: run every scene name back through the
compiled pattern and recover which song and role it belongs to. Scenes have no stable id
in the LOM, and after this they don't need one, because **the name is the record**.

A song is a **label, not a range** — whatever scenes carry its name, wherever they sit —
so a reprise sixty scenes later is the same song for free. `blocks` reports the
contiguous runs for display, and more than one is worth a lint line rather than an error:
the other reason for two blocks is two different songs sharing a name.

`observed` holds the **distinct** values the set carries for each fact, not a single
answer. One entry means the scenes agree; more than one is a disagreement for the library
to arbitrate. Collapsing them to "the first one" would hide exactly the drift this exists
to surface, which is why the songs table renders a clash in amber rather than picking.

**`observed.colorIndex` breaks the omission rule the other facts follow, deliberately.**
A scene that simply doesn't state its key is incomplete rather than contradictory, so
`push` drops it. Color has no such thing as "didn't say": a song is one color, and one
where half the scenes are painted and half aren't is precisely the drift the rule exists
to catch — so **-1 is a value here**, and a half-painted song reports two observations.

`scenesOfSongs` widens a scene selection to every scene of every song it touches. That's
what makes a color write song-scoped rather than selection-scoped; a scene the pattern
couldn't read has no song to widen to and passes through as itself, because dropping it
would make the write a silent no-op on exactly the scenes a mapping pass hasn't reached.

**`MIN_TEMPO` is a range check, not a comparison to −1, and that's the point.**
`Scene.tempo` is documented to answer −1 when the scene has no tempo of its own, but the
snapshot reads it with `gnum`, which answers **0** for a property it couldn't read. Both
sit below any real tempo — Live's own assertion in the 12.4.3 binary is
`>= 20.0 && <= 1000.0` — so a range check treats them identically and cannot be caught
out by which one arrived. That is the same trap that has bitten `color_index`, `parseId`
and the palette sweep, defused by not needing to tell the two apart.

Song identity is case-insensitive, like `roleKey`. `Nightfall` typed in the app and
`nightfall` typed into Live are one song; the alternative splits a song in two over a
shift key and shows it twice in the catalog.

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
