# `songRows.ts`

The row-wise mirror of `trackColumns.ts`, and deliberately shaped
like it: one folds columns into a group header, this folds rows into a song header.

**A header goes above each *block*, not each song.** A song is a label rather than a
range, so its scenes can come in several runs, and heading only the first would leave the
second run visually attached to whatever song precedes it — the opposite of segmenting
the grid. **Collapsing, though, is keyed by song**: folding "Nightfall" folds all of it,
reprise included. Two blocks then show two headers, which is honest, because the set
really does contain that song twice.

`blockTrackRoles` answers the other half of what a folded song shows: per block, per
track, **which sections of the song that track plays**. Not that the sparkle pad is used
— that it's used in the choruses. "Which tracks does this song use" was the first
question and this answers it too, since a track with nothing in the block gets no entry,
but the second question turned out to be the interesting one.

**Keyed by block, not by song**, even though folding is keyed by song — a reprise that
drops the pads is a genuinely different thing to look at than the first run, and averaging
the two would hide exactly the difference the second header exists to show.

**Roles come from `roleIn`, not the derivation's `{role}` token**, so a header summarises
exactly the chips the scene rows below it show. The two can disagree — a name the pattern
reads as one long title can still carry a bracketed tag — and agreeing with what's on
screen matters more than agreeing with the pattern.

Clips on scenes carrying no role are counted separately rather than dropped. A set
mid-mapping is mostly untagged, and a track used only there still has to read as used or
the header lies about what the song holds.

It's one pass over the clips plus one over the scenes, because a full set is thousands of
clips and a hundred blocks and the obvious nesting is their product; ordering by first
appearance happens at the end, per track, where there are a handful. `mergeShapes` folds
several tracks' shapes into one, which is what a collapsed track group's column shows.

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
