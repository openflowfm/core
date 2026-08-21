// Reading a chord progression back out of the notes that are playing.
//
// The set never states its progressions anywhere — no scene name, no device
// parameter, no clip property holds them — so the only place the harmony exists
// is in the MIDI itself. This reads it: notes in, chord symbols out, one per
// window of the loop, so somebody who has never played the song can be handed a
// chart of it.
//
// **This is inference, and it is allowed to say it does not know.** A window
// that spells nothing recognisable gets a null symbol rather than the nearest
// triad, for the same reason `trackStatus` returns null rather than a fourth
// kind: a confident wrong chord is worse than a blank, because a blank sends
// somebody to listen and a wrong one sends them to play.
//
// Imports nothing, deliberately — like `trackStatus.ts` and `livePalette.ts`,
// which is what lets a Node-side client use it. See `chart/docs/following.md`.

/** One note, in the terms `Clip.get_all_notes_extended` reports them. */
export interface ChordNote {
  /** MIDI note number, 0–127, 60 is C3. */
  pitch: number;
  /** Beats from the start of the clip. */
  start: number;
  /** Length in beats. */
  duration: number;
}

/** One stretch of the loop that spells one chord — or spells nothing. */
export interface ChordSegment {
  /** Beats from the clip's start, inclusive. */
  from: number;
  /** Beats from the clip's start, exclusive. */
  to: number;
  /** `Am7`, `F`, `G/B` — or null where nothing was confidently spelled. */
  symbol: string | null;
  /** The root as written, or null with the symbol. */
  root: string | null;
  /**
   * The root's pitch class, 0–11, or null with the symbol.
   *
   * Beside the written root rather than instead of it, because they answer
   * different questions: `root` is what to print, and this is where to draw. A
   * reader plotting a bass line needs a position on a keyboard, and deriving
   * one back from `Bb` would mean parsing a name this module just finished
   * spelling.
   */
  rootClass: number | null;
  /**
   * The chord's pitch classes, root first then ascending.
   *
   * What the chord *is*, as against what it is called. Empty where nothing was
   * spelled. These are the template's tones rather than the pitches anybody
   * played: a voicing spread over three octaves with the third doubled is the
   * same chord, and a chart that drew it literally would be a transcription
   * rather than something to read at a glance.
   */
  tones: number[];
  /** 0–1. Below `SURE` the symbol is null; above it, how clean the match was. */
  confidence: number;
}

export interface ProgressionOptions {
  /** Beats from the clip start to read, inclusive. */
  from: number;
  /** Beats from the clip start to stop at, exclusive. */
  to: number;
  /** Beats to the bar, from the clip's own signature. */
  beatsPerBar: number;
  /**
   * Windows per bar. Two is the default: a half bar almost always contains
   * enough of a triad to name it even when the part is arpeggiated, and it
   * still catches the chord that changes halfway through the last bar.
   */
  perBar?: number;
  /** Spell with flats. Set from the song's key — `Bb`, not `A#`. */
  flats?: boolean;
}

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * The chords worth recognising, as semitones above the root.
 *
 * Ordered **simplest first**, and that ordering is load-bearing: ties go to the
 * earlier entry, so a bare C–E–G is a major triad rather than the maj7 that
 * happens to be missing its seventh. Extending the list with anything exotic
 * means putting it after the plain ones or it will start winning ties.
 */
const TEMPLATES: ReadonlyArray<{ name: string; tones: readonly number[] }> = [
  { name: '', tones: [0, 4, 7] },
  { name: 'm', tones: [0, 3, 7] },
  { name: '5', tones: [0, 7] },
  { name: 'sus4', tones: [0, 5, 7] },
  { name: 'sus2', tones: [0, 2, 7] },
  { name: 'dim', tones: [0, 3, 6] },
  { name: 'aug', tones: [0, 4, 8] },
  { name: '7', tones: [0, 4, 7, 10] },
  { name: 'm7', tones: [0, 3, 7, 10] },
  { name: 'maj7', tones: [0, 4, 7, 11] },
  { name: '6', tones: [0, 4, 7, 9] },
  { name: 'm6', tones: [0, 3, 7, 9] },
  { name: 'm7b5', tones: [0, 3, 6, 10] },
  { name: 'dim7', tones: [0, 3, 6, 9] },
];

/**
 * How much of the window's weight has to land on a chord before it is named.
 *
 * Tuned against the one failure that matters: a passing bar of melody with no
 * harmony under it should come back blank, not as whatever triad its three
 * notes happen to touch.
 */
const SURE = 0.5;

/** A tone the template wants and the window does not have. */
const MISSING_COST = 0.22;
/** Weight sounding in the window that the template does not explain. */
const EXTRA_COST = 0.55;
/**
 * For spelling the lowest sounding note as the root.
 *
 * Am7 and C6 are the same four pitch classes and nothing but the bass separates
 * them, so this is not a tie-breaker bolted on — it is the only information
 * that distinguishes a whole family of chords from another.
 */
const BASS_BONUS = 0.18;
/**
 * Per template tone beyond a triad — a preference for the simpler answer.
 *
 * Without it, any extra pitch class sounding anywhere in the window makes the
 * chord that *contains* it beat the triad that doesn't, because covering it is
 * worth more than the penalty for leaving it out. A melody line over a held Am
 * therefore reads as Am6 for the bar it happens to touch an F#, and a chart
 * that renames the chord every time somebody plays a passing tone is a chart
 * nobody can follow.
 *
 * Small enough that a seventh actually being held still wins: four notes of
 * equal weight spell Am7 far more cleanly than Am plus an unexplained G.
 */
const COMPLEXITY_COST = 0.14;

/** Pitch class, 0–11, for any MIDI note number. */
function pitchClass(pitch: number): number {
  return ((Math.round(pitch) % 12) + 12) % 12;
}

/**
 * How long each pitch class sounds inside one window, as a fraction of the
 * window's total sounding time.
 *
 * **Weighted by duration rather than counted**, which is what stops a passing
 * sixteenth outvoting a held root. A note is counted for the part of it that
 * overlaps the window, so a chord held across four windows contributes to all
 * four rather than only to the one it started in.
 */
function weigh(notes: readonly ChordNote[], from: number, to: number): Map<number, number> {
  const weight = new Map<number, number>();
  let total = 0;
  for (const note of notes) {
    const start = Math.max(from, note.start);
    const end = Math.min(to, note.start + Math.max(0, note.duration));
    const heard = end - start;
    if (!(heard > 0)) continue;
    const pc = pitchClass(note.pitch);
    weight.set(pc, (weight.get(pc) ?? 0) + heard);
    total += heard;
  }
  if (total > 0) for (const [pc, held] of weight) weight.set(pc, held / total);
  return weight;
}

/** The pitch class of the lowest note sounding anywhere in the window. */
function bassOf(notes: readonly ChordNote[], from: number, to: number): number | null {
  let lowest = Number.POSITIVE_INFINITY;
  for (const note of notes) {
    if (note.start >= to) continue;
    if (note.start + Math.max(0, note.duration) <= from) continue;
    if (note.pitch < lowest) lowest = note.pitch;
  }
  return Number.isFinite(lowest) ? pitchClass(lowest) : null;
}

interface Named {
  symbol: string;
  root: string;
  rootClass: number;
  tones: number[];
  confidence: number;
}

/** The best chord the sounding weight spells, or null when nothing does. */
function name(
  weight: Map<number, number>,
  bass: number | null,
  flats: boolean,
): Named | null {
  if (weight.size === 0) return null;

  let best: { root: number; template: (typeof TEMPLATES)[number]; score: number } | null = null;
  for (let root = 0; root < 12; root++) {
    for (const template of TEMPLATES) {
      const tones = new Set(template.tones.map((step) => (root + step) % 12));
      let covered = 0;
      let extra = 0;
      for (const [pc, held] of weight) {
        if (tones.has(pc)) covered += held;
        else extra += held;
      }
      let missing = 0;
      let matched = 0;
      for (const tone of tones) {
        if (weight.has(tone)) matched++;
        else missing++;
      }

      // **Three sounding tones, or no name.** Two notes do not identify a
      // chord: B and C# match two thirds of Bsus2, and with the bass bonus on
      // top of that they scored 0.96 — a melody with no harmony under it
      // confidently named as a suspension. The exception is the two-note
      // template itself, a bare fifth, which is the one chord that genuinely
      // has nothing more to it.
      if (matched < Math.min(3, tones.size)) continue;

      const score =
        covered -
        extra * EXTRA_COST -
        missing * MISSING_COST -
        Math.max(0, tones.size - 3) * COMPLEXITY_COST +
        (bass !== null && bass === root ? BASS_BONUS : 0);

      // Strictly greater, so the simplest template that ties wins — see the
      // ordering note on TEMPLATES.
      if (!best || score > best.score) best = { root, template, score };
    }
  }
  if (!best) return null;

  const confidence = Math.max(0, Math.min(1, best.score));
  if (confidence < SURE) return null;

  const root = (flats ? FLAT : SHARP)[best.root]!;
  // A slash chord only where the bass is genuinely not the root. Writing C/C
  // would be noise, and writing the inversion of every voicing would bury the
  // progression in detail nobody reading a chart off a phone needs.
  const slash = bass !== null && bass !== best.root ? `/${(flats ? FLAT : SHARP)[bass]!}` : '';
  return {
    symbol: `${root}${best.template.name}${slash}`,
    root,
    rootClass: best.root,
    tones: best.template.tones.map((step) => (best.root + step) % 12),
    confidence,
  };
}

/**
 * A pitch class as a note name, spelled the way the chart is.
 *
 * Exported so a reader drawing a keyboard labels its rows with the same
 * spelling the symbols use. A chart that says `Bb` beside a row labelled `A#`
 * is asking somebody to do the conversion mid-song.
 */
export function noteName(pc: number, flats = false): string {
  return (flats ? FLAT : SHARP)[pitchClass(pc)] ?? '';
}

/**
 * A MIDI note as Live writes it, octave and all — 60 is `C3`.
 *
 * **Live's convention, not the scientific one**, where 60 is C4 and everything
 * is a number higher. The chart is read next to Live and by people who read the
 * clip in Live, so a roll whose gutter disagreed with the piano roll they would
 * open to check it would be worse than one with no labels on it. It puts a
 * five-string's low B at `B-1` and a four-string's low E at `E0`, which look
 * wrong written down and are exactly what Live shows.
 */
export function pitchName(pitch: number, flats = false): string {
  return `${noteName(pitch, flats)}${Math.floor(pitch / 12) - 2}`;
}

/** Whether a pitch class is a black key, for drawing one. */
export function isBlackKey(pc: number): boolean {
  const at = pitchClass(pc);
  return at === 1 || at === 3 || at === 6 || at === 8 || at === 10;
}

/** Live's own drum instruments, which say what they are. */
function drumClass(className: string): boolean {
  const clean = className.trim();
  return clean === 'DrumGroupDevice' || clean === 'InstrumentImpulse';
}

/**
 * Whether a clip is percussion rather than harmony.
 *
 * Merging drums into the pitch set is not a small error — a kick and a snare
 * sit at C1 and D1, so `Am | F | C | G` reads back as `Am6 | F6 | C | Gmaj7`
 * with a drum track in it, and a drum loop is usually the longest clip playing
 * so it also decides how long the chart thinks the progression is.
 *
 * **The device class is not enough.** It catches a Drum Rack and an Impulse and
 * nothing else: a third-party drum plugin answers `PluginDevice`, exactly like
 * a synth, and a kit inside an Instrument Rack answers `InstrumentGroupDevice`.
 * Measured against a real set, the drum track reported `PluginDevice` and was
 * merged into every chord.
 *
 * So the notes are asked instead, and four things have to be true at once. A
 * drum kit maps *unrelated sounds* across a wide stretch of keyboard, which is
 * the signal nothing musical produces: many notes, few pitch classes, a spread
 * far wider than any voicing, and hits rather than held tones. From the set
 * this was built against:
 *
 * ```
 *  track          per bar  classes  spread  median duration
 *  Sparkle Pad        1.0        4       9            16.00
 *  Pluck              1.0        4       7            15.98
 *  Bass               5.0        2       2             0.21
 *  Drums             16.4        4      41             0.13   <- all four
 * ```
 *
 * **Requiring all four is what keeps it conservative.** The case it can still
 * get wrong is a busy sixteenth-note arpeggio spanning three octaves on few
 * pitch classes, which by these numbers is shaped like a drum pattern. Losing
 * that costs a chart one of its sources, where letting a drum kit through costs
 * it every chord — so the bias is deliberate. If it ever misfires on a real
 * part, the fix is to let the set say so rather than to loosen this.
 */
export function looksPercussive(
  notes: readonly ChordNote[],
  bars: number,
  className = '',
): boolean {
  if (drumClass(className)) return true;
  if (notes.length === 0 || !(bars > 0)) return false;

  if (notes.length / bars < 12) return false;

  const classes = new Set<number>();
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const note of notes) {
    classes.add(pitchClass(note.pitch));
    if (note.pitch < low) low = note.pitch;
    if (note.pitch > high) high = note.pitch;
  }
  if (classes.size > 5) return false;
  if (high - low < 24) return false;

  const held = notes.map((note) => note.duration).sort((a, b) => a - b);
  const median = held[Math.floor(held.length / 2)] ?? 0;
  return median <= 0.5;
}

/**
 * Whether a key is written with flats.
 *
 * Takes the key exactly as the scene names spell it — `Bm`, `F#m`, `Eb` — and
 * answers for the *chart*, so the symbols above a bar line up with what the set
 * already says the song is in.
 */
export function spellsFlat(key: string): boolean {
  const clean = key.trim();
  if (clean === '') return false;
  if (clean.includes('b') && /^[A-G]b/.test(clean)) return true;
  if (clean.includes('#')) return false;
  const minor = /m$/.test(clean);
  const letter = clean[0]?.toUpperCase() ?? '';
  // The naturals that carry flats in their signature: F major, and the minors
  // whose relative majors do.
  const flatMajors = new Set(['F']);
  const flatMinors = new Set(['D', 'G', 'C', 'F']);
  return minor ? flatMinors.has(letter) : flatMajors.has(letter);
}

/**
 * The pitch class a key is built on — `Bb` is 10, `F#m` is 6.
 *
 * Takes the key exactly as the scene names spell it, like `spellsFlat`, and
 * answers null for anything it cannot read rather than guessing at C. Null is
 * what turns the roll's degree colouring off, and a roll coloured against the
 * wrong root is worse than one not coloured at all: the colours would still
 * look deliberate.
 */
export function keyRoot(key: string): number | null {
  const clean = key.trim();
  const letter = LETTER[clean.charAt(0).toUpperCase()];
  if (letter === undefined) return null;
  const next = clean.charAt(1);
  // `Bb` is B flat and `Bm` is B minor, which is the whole of the ambiguity —
  // an accidental is the only thing that can follow the letter and change the
  // pitch.
  const shift = next === '#' ? 1 : next === 'b' ? -1 : 0;
  return pitchClass(letter + shift);
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Semitones from the key's root, 0–11, with the root itself at 0. */
export function degreeOf(pitch: number, root: number): number {
  return pitchClass(pitch - root);
}

const DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/** A degree as an interval, always from the major scale: `b3`, never `#2`. */
export function degreeName(degree: number): string {
  return DEGREE[pitchClass(degree)] ?? '';
}

/**
 * The colour a scale degree is always drawn in.
 *
 * **A step of a fifth is a step of the colour wheel.** Thirty degrees of hue per
 * fifth, root at red, which makes the whole scheme one sentence long — the
 * property that matters, because it is only worth anything to somebody who has
 * memorised it.
 *
 * Two things fall out of that rule, and both are why it is the fifths and not
 * the chromatic ladder:
 *
 * - **A flattened degree lands 150° from its natural** — b3 violet against a
 *   green 3, b7 magenta against a spring-green 7. Near enough opposite that
 *   major or minor is readable across a stage without reading anything.
 * - **A chromatic run alternates violently** instead of shading through three
 *   neighbouring greens, which is what `degree * 30` gives and what makes a
 *   walk-up unreadable.
 *
 * The cost is that the root and the fifth land a step apart, red and orange, and
 * those are the two a bass player reads most. The roll pays for that outside the
 * colour: a root note is drawn with a ring round it, so the one degree that has
 * to be unmistakable does not depend on hue at all.
 *
 * Lightness moves with hue because it has to. At one fixed value a yellow 2 is
 * glare and a blue b6 is a hole, and both carry dark text at the size a phone
 * draws them.
 */
export function degreeColor(degree: number): string {
  const step = (pitchClass(degree) * 7) % 12;
  return `hsl(${step * 30} 72% ${LIGHTNESS[step]}%)`;
}

/** Perceived-brightness trim, indexed by the same step as the hue. */
const LIGHTNESS = [62, 60, 56, 54, 54, 56, 60, 64, 68, 68, 66, 64];

/**
 * How many windows the progression actually takes before it repeats.
 *
 * A four-bar progression written into an eight-bar clip is still a four-bar
 * progression, and drawing it twice wastes half a phone screen on a repeat —
 * which matters most where it is scarcest. This finds the shortest whole
 * number of **bars** the labels repeat on, so a chart contracts to the length
 * of the music rather than the length of the longest clip that happens to be
 * playing.
 *
 * **Floored at four bars.** A song sitting on one chord repeats every window,
 * and collapsing that to a single bar of Am would be technically true and
 * useless: nobody reads a one-bar chart, and the bar count is part of what says
 * how long you are on it. Four is what a progression is written in unless the
 * clip is shorter than that, in which case the clip wins.
 */
function repeatingWindows(labels: ReadonlyArray<Named | null>, perBar: number): number {
  const floor = Math.min(labels.length, perBar * 4);
  for (let period = perBar; period < labels.length; period += perBar) {
    if (period < floor) continue;
    if (labels.length % period !== 0) continue;
    let repeats = true;
    for (let i = period; i < labels.length && repeats; i++) {
      if ((labels[i]?.symbol ?? null) !== (labels[i % period]?.symbol ?? null)) repeats = false;
    }
    if (repeats) return period;
  }
  return labels.length;
}

/**
 * The progression the notes spell, window by window, with runs of the same
 * chord merged.
 *
 * Merging is what makes it a chart rather than a grid: a song sitting on Am for
 * four bars should be one cell that says Am, not eight that do.
 */
export function readProgression(
  notes: readonly ChordNote[],
  options: ProgressionOptions,
): ChordSegment[] {
  const { from, to, beatsPerBar } = options;
  const perBar = Math.max(1, Math.round(options.perBar ?? 2));
  const flats = options.flats ?? false;

  if (!isFinite(from) || !isFinite(to) || !(to > from)) return [];
  if (!(beatsPerBar > 0)) return [];

  const step = beatsPerBar / perBar;
  if (!(step > 0)) return [];
  // A loop longer than this is not a progression anybody reads off a phone, and
  // the window count is what bounds the work.
  const windows = Math.min(512, Math.ceil((to - from) / step));

  const labels: Array<Named | null> = [];
  for (let i = 0; i < windows; i++) {
    const start = from + i * step;
    const end = Math.min(to, start + step);
    labels.push(name(weigh(notes, start, end), bassOf(notes, start, end), flats));
  }

  const kept = labels.slice(0, repeatingWindows(labels, perBar));

  const out: ChordSegment[] = [];
  for (let i = 0; i < kept.length; i++) {
    const start = from + i * step;
    const end = Math.min(to, start + step);
    const found = kept[i]!;

    const last = out[out.length - 1];
    // Merge only an identical symbol, and merge two blanks as well: a rest is
    // as much a run as a chord is.
    if (last && last.symbol === (found?.symbol ?? null)) {
      last.to = end;
      if (found) last.confidence = Math.max(last.confidence, found.confidence);
      continue;
    }
    out.push({
      from: start,
      to: end,
      symbol: found?.symbol ?? null,
      root: found?.root ?? null,
      rootClass: found?.rootClass ?? null,
      tones: found ? found.tones : [],
      confidence: found?.confidence ?? 0,
    });
  }
  return out;
}
