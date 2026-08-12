# `derive.ts`

The other half of the trick: run every scene name back through the
compiled pattern and recover which song, artist, tag and role it belongs to. Scenes have no
stable id in the LOM, and after this they don't need one, because **the name is the
record**.

A song is a **label, not a range** — whatever scenes carry its name, wherever they sit —
so a reprise sixty scenes later is the same song for free. `blocks` reports the
contiguous runs for display, and more than one is worth a lint line rather than an error:
the other reason for two blocks is two different songs sharing a name.

`observed` holds the **distinct** values the set carries for each fact, not a single
answer. One entry means the scenes agree; more than one is a disagreement for the library
to arbitrate. Collapsing them to "the first one" would hide exactly the drift this exists
to surface, which is why the songs table renders a clash in amber rather than picking.

`extractedBpm` is deliberately stricter than `observed.tempo`. It exists only when
**every scene carrying the song has its own `Scene.tempo`, and all of those tempos are
identical**. A single scene that follows the Live Set tempo makes the answer unknown, as
does a differing reprise. Song headers use this as a read-only fallback when the names do
not already state `{bpm}`; taking a snapshot never renames a scene.

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
