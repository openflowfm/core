# `chords.ts`

Reading a chord progression back out of the notes that are playing.

**This is the only thing in the project that infers rather than reads.** Every other fact
about a set is *stated* somewhere — scene names carry the song, the key, the role; device
state carries the vocabulary. A set states its progressions nowhere at all, so the only
place the harmony exists is the MIDI itself.

That changes what correctness means here. Everything else can be wrong only if the code is
wrong; this can be wrong because music is ambiguous. So the module is built to decline.

## Nothing reads the progression right now

**`readProgression` and `looksPercussive` have no caller.** The chart drew inferred chord
symbols and now draws the bass track's clip note for note — see
[the bass roll](../../chart/docs/reading.md) for why. What the phone still uses from this
file is the naming: `noteName`, `pitchName`, `isBlackKey` and `spellsFlat` label the roll's
keyboard in the spelling the set's own key states.

It is kept because it is pure, tested and the question it answers has not gone away: the
keys player wants the harmony, and the material to work it out from is the same material.
It is the *display* that did not earn its space, not the inference. **If it stays unread it
should come out**, tests and doc together — an untested claim is better than a tested one
nothing exercises against real material.

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

`looksPercussive` exists because drums are MIDI too, and a kick and snare at C1 and D1 are
not a small error. Measured on a four-chord loop:

```
keys + bass + pad     Am | F  | C | G
keys alone (arpeggio) Am | F  | C | G
bass alone            —                  (single notes spell nothing, correctly)
with drums merged in  Am6| F6 | C | Gmaj7
```

**The device class is not enough**, which took a real set to find out. It catches a Drum
Rack and an Impulse; a third-party drum plugin answers `PluginDevice` exactly like a synth,
and a kit inside an Instrument Rack answers `InstrumentGroupDevice`. The set this was built
against reported `PluginDevice`, so its kit was merged into every chord *and*, being the
longest clip playing, decided how long the chart was.

So the notes are asked instead, and four things have to hold at once. A drum kit maps
**unrelated sounds across a wide stretch of keyboard**, which is the shape nothing musical
has:

```
 track          per bar  classes  spread  median duration
 Sparkle Pad        1.0        4       9            16.00
 Pluck              1.0        4       7            15.98
 Bass               5.0        2       2             0.21
 Drums             16.4        4      41             0.13   <- all four
```

Requiring all four is what keeps it conservative. What it can still get wrong is a busy
sixteenth-note arpeggio over three octaves on few pitch classes, which by these numbers
really is shaped like a kit — a diminished cycle up the keyboard is the clearest example.
Losing that costs a chart one of its sources; letting a kit through costs it every chord,
so the bias is deliberate. If it misfires on a real part the fix is to let the *set* say
so, not to loosen this.

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

## How long the chart is

The progression is trimmed to the shortest whole number of **bars** its labels repeat on. A
four-bar progression written into an eight-bar clip is still four bars, and drawing it twice
spends half a phone screen on a repeat — which matters most where space is scarcest. It is
also what stops the longest clip playing from deciding the answer: a drum loop is usually
the longest thing in a scene, and even excluded from the harmony its *length* used to be
inherited by whatever clip came next.

**Floored at four bars.** A song sitting on one chord repeats every window, and collapsing
that to a single bar of Am is true and useless: nobody reads a one-bar chart, and how long
you are on the chord is part of what the chart says. Four is what a progression is written
in, unless the clip itself is shorter — in which case the clip wins.

## Naming a note the way Live does

`pitchName` puts an octave on a pitch, and it uses **Live's convention rather than the
scientific one** — 60 is `C3`, so a four-string bass's open E is `E0` and the low B a
five-string adds under it is `B-1`. Both look a semitone-and-an-octave wrong written down,
and both are what Live shows.

The rule is that a label on a chart must survive being checked. Somebody who does not
believe the roll will open the clip in Live, and a gutter disagreeing with Live's own piano
roll would make the chart the thing that was wrong. `widgets/param/format.ts` has its own
copy of this for parameter values, because rule 1 keeps the two modules from importing each
other.

## Imports nothing

Like `trackStatus.ts` and `livePalette.ts`, and for the same reason: Node's type stripping
cannot follow `core/`'s `.js` specifiers, so a file that imports nothing is one a Node-side
client can use. See [`chart/docs/following.md`](../../chart/docs/following.md).
