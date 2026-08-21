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

/** Whether a pitch class is a black key, for drawing one. */
export function isBlackKey(pc: number): boolean {
  const at = pitchClass(pc);
  return at === 1 || at === 3 || at === 6 || at === 8 || at === 10;
}

/**
 * Whether an instrument's notes are percussion rather than harmony.
 *
 * Drums are MIDI like everything else, and merging them into the pitch set is
 * not a small error — a kick and a snare sit at C1 and D1, so a four-chord loop
 * of `Am | F | C | G` reads back as `Am6 | F6 | C | Gmaj7` with a drum track in
 * it. Measured, not guessed at.
 *
 * Matched on Live's `Device.class_name`, which `ClipNotes.instrument` carries
 * for exactly this. A track whose instrument is unknown or absent is *not*
 * treated as percussion: an unrecognised synth should still make chords, and
 * the failure of guessing wrong in that direction is a chart that is merely
 * incomplete rather than one that is wrong.
 */
export function isPercussion(className: string): boolean {
  const clean = className.trim();
  return clean === 'DrumGroupDevice' || clean === 'InstrumentImpulse';
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

  const out: ChordSegment[] = [];
  for (let i = 0; i < windows; i++) {
    const start = from + i * step;
    const end = Math.min(to, start + step);
    const weight = weigh(notes, start, end);
    const found = name(weight, bassOf(notes, start, end), flats);

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
