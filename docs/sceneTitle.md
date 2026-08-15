# `sceneTitle.ts`

Everything in a scene name *except* the role tag:

```
[CHORUS] @128-Bm NIGHTFALL - THE AVIATORS {COVER}
 └ role┘  │   │   └ song ┘   └ artist ┘    └ tag┘   roles.ts owns the role
         bpm  └ key
```

An optional bpm and key precede the required song, an optional artist follows it behind
`" - "`, and an optional song tag comes last.
`roles.ts` owns the bracketed role, this owns what follows it, and `titleOps` composes them — it rewrites the title and
puts the scene's own role back on, so renaming a song across eighteen scenes doesn't
disturb the roles you assigned them.

**Role and facts first, name next, song tag last.** Live's narrow scene column keeps the
performance metadata visible and truncates the app-only catalog tag first. Our grid
lifts every field into its own presentation, so the tag remains easy to scan there.

The song tag is a single optional, open-vocabulary classification written with literal
braces. The editor currently suggests `COVER`, `ORIGINAL` and `JAM`, but `{REMIX}` or
`{LATE NIGHT}` parse just as well. The pattern spelling is `({{tag}})?`: the inner
`{tag}` is the pattern token and the outer braces are the characters written into the
scene name. Those delimiters make custom tags reversible without matching a fixed list.
The suggestions can later become device-state configuration alongside roles without
changing the stored scene-name format.

`@` opens the facts from the front. It can't appear in `ROLE_CHARS` and won't start a
title, so the group is identifiable without a closing delimiter. That asymmetry with the
role's brackets is deliberate — a role is recognised by *vocabulary* and so must stay
visible when its name is unknown; bpm and key are recognised by *shape* and can't fail the
same way. The `-` between them is a **separator** and drops with either of them, so
`@128-Bm`, `@128` and `@Bm` are one shape rather than three — and a key-only name is
spelled byte-for-byte as the key-only convention spelled it, which is why this change
needed no set renamed.

**BPM is a label, and `formatTitle` writes it.** It used to live only on Live's
`Scene.tempo`, and that made mixing into the middle of a song impossible: Live takes a
scene's own tempo the moment that scene fires, so every scene of a 128 song snapped the
set to 128 however fast it was already running. The name is the record now; projecting
that bpm onto the song's **first** scene is a separate deliberate action — `songTempoOps`
in `roles.ts`.

**Parsing is anchored at both ends and never guesses in the middle.** The key is read
only from a leading `@` group and the tag only from trailing literal braces, so `Arp Jam 2` keeps its whole title rather than having the
`2` read as a tempo, and `Em Dash` keeps its whole title rather than having `Em` read as a
key. The property worth relying on: **parse and format round-trip**, modulo case. A title
this can't decompose comes back with only its capitalisation changed rather than
rearranged, which is what makes it safe to run a patch over a name nobody meant to
restructure. There's a test per shape for exactly that.

**The song is written in caps and read case-insensitively.** `songKey` already folds case,
so `NIGHTFALL` and `Nightfall` are one song and the uppercase is presentation rather than
identity — which is exactly what stops the convention change from splitting the library in
two while a set is half-converted.

**The artist is a fact about the song, not part of its identity.** `songKey` folds the name
alone, so two scenes naming different artists for one title are a *disagreement* the songs
list reports in amber, exactly like two keys — not two songs. That follows the split the
whole scheme rests on: the library is authoritative for what a song *is*, and the set
states it. The case it deliberately doesn't split is two genuinely different songs sharing
a title, which already shows up as more than one block.

**Song and artist are both free text, so the separator is the only thing that can divide
them** — the same rule `namePattern.ts` states for `{song} - {label}`. The split takes the
**first** `" - "`, because the compiled `{song}` matches lazily and the two parsers have to
agree; a name that read one way in the grid and another in a rename would map one song and
write a different one. There's a test comparing them shape by shape. The cost is real and
unavoidable: a song genuinely called `SUNDAY - BLOODY SUNDAY` now reads as a song by an
artist. The editors refuse to *write* one — `splitsAsArtist` is what they ask — so the only
way to get one is a name typed into Live.

The spaces around the hyphen are load-bearing, and that's what keeps `TWENTY-ONE` whole.
`formatTitle` drops an artist with no song rather than writing `" - THE AVIATORS"`, which
would read back as a song called that: the unwritable half goes instead of the round trip.

`parseTitle` also still reads the short-lived leading-tag form and the legacy trailing
`128 Bm`. That's the migration path: a set named any earlier way keeps showing its
metadata, and any rename writes the current `[ROLE] @BPM-KEY SONG {TAG}` convention.
A no-op patch is therefore not a no-op rename on an old-convention scene — it is the one
gesture that converts a scene without changing what it says.

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
