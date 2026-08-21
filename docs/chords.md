# `chords.ts`

Reading a chord progression back out of the notes that are playing.

**This is the only thing in the project that infers rather than reads.** Every other fact
about a set is *stated* somewhere — scene names carry the song, the key, the role; device
state carries the vocabulary. A set states its progressions nowhere at all, so the only
place the harmony exists is the MIDI itself.

That changes what correctness means here. Everything else can be wrong only if the code is
wrong; this can be wrong because music is ambiguous. So the module is built to decline.

## It is allowed to say it does not know

A window that spells nothing recognisable returns a null symbol rather than the nearest
triad, for the reason `trackStatus` returns null rather than inventing a fourth kind: **a
confident wrong chord is worse than a blank**, because a blank sends somebody to listen and
a wrong one sends them to play.

Two rules do the declining, and both were put there by a failing test rather than foresight:

- **Three sounding tones, or no name.** Two notes do not identify a chord. B and C# match
  two thirds of Bsus2, and with the bass bonus that scored 0.96 — a bare melody line
  confidently named as a suspension. The one exception is the two-note template itself, a
  bare fifth, which genuinely has nothing more to it.
- **A confidence floor.** Tuned against a bar of melody with no harmony under it, which
  should come back blank rather than as whatever triad its notes happen to touch.

## How a window is judged

Pitch classes are **weighted by how long they sound**, not counted. That is what stops a
passing sixteenth outvoting a held root, and a note is counted for the part of it that
overlaps the window, so a chord held across four windows is heard in all four rather than
only in the one it started in.

Each of twelve roots is tried against each template, scored as *covered weight*, less
weight the template does not explain, less a penalty per template tone that is missing.
`TEMPLATES` is **ordered simplest first and ties go to the earlier entry**, so a bare C–E–G
is a major triad rather than the maj7 that happens to be missing its seventh. Anything
exotic added to that list has to go after the plain ones or it will start winning ties.

**The bass gets a bonus, and it is not a tie-breaker.** A–C–E–G is Am7 under an A and C6
under a C; the two are the same four pitch classes and nothing else distinguishes them. The
lowest sounding note is the only information there is, which is also why merging the bass
track into the analysis improves it so much.

## The window is half a bar

Fine enough to catch a chord that changes halfway through the last bar, coarse enough that
an arpeggio still spells its chord — the notes of a broken Am arrive one at a time, and
over half a bar all three have sounded. At beat resolution the same part is a run of single
notes that names nothing.

Adjacent windows with the same label merge, which is what makes the result a chart rather
than a grid: a song sitting on Am for four bars is one cell that says Am, not eight.

## What it is fed matters more than any of this

`isPercussion` exists because drums are MIDI too, and a kick and snare at C1 and D1 are not
a small error. Measured on a four-chord loop:

```
keys + bass + pad     Am | F  | C | G
keys alone (arpeggio) Am | F  | C | G
bass alone            —                  (single notes spell nothing, correctly)
with drums merged in  Am6| F6 | C | Gmaj7
```

It matches on Live's `Device.class_name`, which the wire carries for exactly this. A track
whose instrument is unrecognised is **not** treated as percussion: an unknown synth should
still make chords, and guessing wrong in that direction leaves a chart incomplete rather
than misspelled.

## What a chord *is*, beside what it is called

A segment carries `tones` and `rootClass` as well as `symbol` and `root`, and the pair is
deliberate: the strings are what to print and the numbers are where to draw. Anything
plotting a keyboard needs a position, and deriving one back out of the text `Bb` would mean
re-parsing a name this module just finished spelling.

They are the **template's** tones rather than the pitches anybody played. A voicing spread
over three octaves with the third doubled is the same chord, and drawing it literally makes
a transcription rather than something to read at a glance.

`noteName` and `isBlackKey` are here for the same reason `spellsFlat` is — so a reader
drawing a keyboard labels its rows with the spelling the symbols use. A chart that says
`Bb` beside a row labelled `A#` asks somebody to do the conversion mid-song.

`spellsFlat` takes the key the scene names already state, so the chart reads `Bb` where the
set says `Bb` rather than `A#`.

## Imports nothing

Like `trackStatus.ts` and `livePalette.ts`, and for the same reason: Node's type stripping
cannot follow `core/`'s `.js` specifiers, so a file that imports nothing is one a Node-side
client can use. See [`chart/docs/following.md`](../../chart/docs/following.md).
