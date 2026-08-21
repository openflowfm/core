import { describe, expect, it } from 'vitest';
import {
  looksPercussive,
  pitchName,
  readProgression,
  spellsFlat,
  type ChordNote,
} from './chords.js';

/** A chord held for `duration` beats from `start`, as pitches. */
function chord(start: number, duration: number, pitches: number[]): ChordNote[] {
  return pitches.map((pitch) => ({ pitch, start, duration }));
}

const BAR = { beatsPerBar: 4, perBar: 2 };

/** A triad held for the whole of one bar. */
function triadAt(bar: number, pitches: number[]): ChordNote[] {
  return pitches.map((pitch) => ({ pitch, start: bar * 4, duration: 4 }));
}
const symbols = (segments: { symbol: string | null }[]) => segments.map((s) => s.symbol);

describe('readProgression', () => {
  it('names a held triad from its notes', () => {
    // A C major triad held for a bar: C3 E3 G3.
    const out = readProgression(chord(0, 4, [60, 64, 67]), { from: 0, to: 4, ...BAR });
    expect(symbols(out)).toEqual(['C']);
  });

  it('hears minor, seventh and suspended qualities apart', () => {
    const at = (pitches: number[]) =>
      symbols(readProgression(chord(0, 4, pitches), { from: 0, to: 4, ...BAR }))[0];

    expect(at([57, 60, 64])).toBe('Am');
    expect(at([57, 60, 64, 67])).toBe('Am7');
    expect(at([55, 59, 62, 65])).toBe('G7');
    expect(at([60, 64, 67, 71])).toBe('Cmaj7');
    expect(at([60, 65, 67])).toBe('Csus4');
  });

  it('merges a chord held across windows into one cell', () => {
    // Four bars of Am is one cell, not eight.
    const out = readProgression(chord(0, 16, [57, 60, 64]), { from: 0, to: 16, ...BAR });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: 0, to: 16, symbol: 'Am' });
  });

  it('follows a progression that changes every bar', () => {
    const notes = [
      ...chord(0, 4, [57, 60, 64]),
      ...chord(4, 4, [53, 57, 60]),
      ...chord(8, 4, [48, 52, 55]),
      ...chord(12, 4, [55, 59, 62]),
    ];
    const out = readProgression(notes, { from: 0, to: 16, ...BAR });
    expect(symbols(out)).toEqual(['Am', 'F', 'C', 'G']);
    expect(out.map((s) => [s.from, s.to])).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
      [12, 16],
    ]);
  });

  it('catches a chord that changes halfway through the bar', () => {
    const notes = [...chord(0, 2, [60, 64, 67]), ...chord(2, 2, [55, 59, 62])];
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR }))).toEqual(['C', 'G']);
  });

  it('reads an arpeggio as the chord it spells', () => {
    // The whole point of a half-bar window: one note at a time still spells Am
    // across the window even though no two notes sound together.
    const notes: ChordNote[] = [
      { pitch: 57, start: 0, duration: 0.5 },
      { pitch: 60, start: 0.5, duration: 0.5 },
      { pitch: 64, start: 1, duration: 0.5 },
      { pitch: 60, start: 1.5, duration: 0.5 },
      { pitch: 57, start: 2, duration: 0.5 },
      { pitch: 60, start: 2.5, duration: 0.5 },
      { pitch: 64, start: 3, duration: 0.5 },
      { pitch: 60, start: 3.5, duration: 0.5 },
    ];
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR }))).toEqual(['Am']);
  });

  it('lets the bass decide between chords built from the same notes', () => {
    // A C E G is Am7 under an A and C6 under a C — nothing else separates them.
    const under = (bass: number) =>
      symbols(readProgression(chord(0, 4, [bass, 69, 72, 76, 79]), { from: 0, to: 4, ...BAR }))[0];

    expect(under(45)).toBe('Am7');
    expect(under(48)).toBe('C6');
  });

  it('writes a slash chord only when the bass is not the root', () => {
    const rooted = readProgression(chord(0, 4, [48, 64, 67]), { from: 0, to: 4, ...BAR });
    expect(rooted[0]!.symbol).toBe('C');

    const inverted = readProgression(chord(0, 4, [52, 60, 67]), { from: 0, to: 4, ...BAR });
    expect(inverted[0]!.symbol).toBe('C/E');
  });

  it('says nothing rather than naming a chord a melody only brushes past', () => {
    // A run of single notes with no harmony under it. A wrong chord here sends
    // somebody to play; a blank sends them to listen.
    const notes: ChordNote[] = [
      { pitch: 60, start: 0, duration: 0.25 },
      { pitch: 62, start: 0.5, duration: 0.25 },
      { pitch: 65, start: 1, duration: 0.25 },
      { pitch: 66, start: 1.5, duration: 0.25 },
      { pitch: 71, start: 2, duration: 0.25 },
      { pitch: 73, start: 2.5, duration: 0.25 },
    ];
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR }))).toEqual([null]);
  });

  it('reports silence as a blank rather than as a chord', () => {
    const out = readProgression([], { from: 0, to: 8, ...BAR });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: 0, to: 8, symbol: null, root: null, confidence: 0 });
  });

  it('keeps the triad when a melody brushes a note that is not in it', () => {
    // A held Am with a line over it that touches F#. Naming that bar Am6 is how
    // a chart ends up renaming the chord every time somebody plays a passing
    // tone — and the sixth is not what the rhythm section is playing.
    const held = chord(0, 4, [57, 60, 64]);
    const line = [69, 71, 72, 66, 74, 71, 69, 67].map((pitch, i) => ({
      pitch,
      start: i * 0.5,
      duration: 0.5,
    }));
    expect(symbols(readProgression([...held, ...line], { from: 0, to: 4, ...BAR }))).toEqual([
      'Am',
    ]);
  });

  it('still hears a seventh that is actually being held', () => {
    // The complexity prior must not swallow a real one: four notes of equal
    // weight spell Am7 far more cleanly than Am plus an unexplained G.
    expect(symbols(readProgression(chord(0, 4, [57, 60, 64, 67]), { from: 0, to: 4, ...BAR }))).toEqual(
      ['Am7'],
    );
  });

  it('is not fooled by a passing sixteenth against a held chord', () => {
    // Duration weighting: the F# sounds, but for a fraction of what the triad
    // does, so it must not turn C into something else.
    const notes = [...chord(0, 4, [60, 64, 67]), { pitch: 66, start: 2, duration: 0.25 }];
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR }))).toEqual(['C']);
  });

  it('counts a chord held across a window boundary in both windows', () => {
    // Starts in the first half, sounds through the second. Both halves are Am,
    // so they merge — which only happens if the second half heard it at all.
    const out = readProgression(chord(0, 4, [57, 60, 64]), { from: 0, to: 4, ...BAR });
    expect(out).toHaveLength(1);
    expect(out[0]!.to).toBe(4);
  });

  it('spells with flats when the song does', () => {
    const notes = chord(0, 4, [58, 62, 65]);
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR, flats: true }))).toEqual(['Bb']);
    expect(symbols(readProgression(notes, { from: 0, to: 4, ...BAR }))).toEqual(['A#']);
  });

  it('reads the signature rather than assuming four beats to the bar', () => {
    // 3/4: a half-bar window is 1.5 beats, so two chords in a bar land apart.
    const notes = [...chord(0, 1.5, [60, 64, 67]), ...chord(1.5, 1.5, [55, 59, 62])];
    const out = readProgression(notes, { from: 0, to: 3, beatsPerBar: 3, perBar: 2 });
    expect(symbols(out)).toEqual(['C', 'G']);
  });

  it('reads only the stretch it was asked for', () => {
    const notes = [...chord(0, 4, [60, 64, 67]), ...chord(4, 4, [57, 60, 64])];
    expect(symbols(readProgression(notes, { from: 4, to: 8, ...BAR }))).toEqual(['Am']);
  });

  it('refuses a span that cannot mean anything', () => {
    expect(readProgression(chord(0, 4, [60, 64, 67]), { from: 4, to: 4, ...BAR })).toEqual([]);
    expect(readProgression(chord(0, 4, [60, 64, 67]), { from: 0, to: 4, beatsPerBar: 0 })).toEqual(
      [],
    );
    expect(
      readProgression(chord(0, 4, [60, 64, 67]), { from: 0, to: Number.NaN, ...BAR }),
    ).toEqual([]);
  });

  it('bounds the work a very long loop can ask for', () => {
    const out = readProgression(chord(0, 4, [60, 64, 67]), { from: 0, to: 100000, ...BAR });
    expect(out.length).toBeLessThanOrEqual(512);
  });
});

describe('what a chord is, as against what it is called', () => {
  it('carries the pitch classes it is built from, root first', () => {
    const [am] = readProgression(chord(0, 4, [57, 60, 64]), { from: 0, to: 4, ...BAR });
    // A, C, E — root first, then ascending.
    expect(am).toMatchObject({ symbol: 'Am', root: 'A', rootClass: 9, tones: [9, 0, 4] });
  });

  it('gives the template\'s tones rather than the pitches anybody played', () => {
    // The same chord voiced over three octaves with the third doubled is still
    // three pitch classes — a chart is not a transcription.
    // C2 E3 G4 E5 C6 — three pitch classes, five notes, four octaves.
    const spread = readProgression(chord(0, 4, [36, 52, 67, 76, 84]), { from: 0, to: 4, ...BAR });
    expect(spread[0]).toMatchObject({ symbol: 'C', tones: [0, 4, 7] });
  });

  it('has nothing to draw where it had nothing to name', () => {
    const [quiet] = readProgression([], { from: 0, to: 4, ...BAR });
    expect(quiet).toMatchObject({ symbol: null, root: null, rootClass: null, tones: [] });
  });

  it('roots a slash chord on the chord, not on the bass under it', () => {
    // C/E is still rooted on C — the bass note is in the name, not the root.
    const [inverted] = readProgression(chord(0, 4, [52, 60, 67]), { from: 0, to: 4, ...BAR });
    expect(inverted).toMatchObject({ symbol: 'C/E', rootClass: 0, tones: [0, 4, 7] });
  });
});

describe('spellsFlat', () => {
  it('follows a key that is written with one', () => {
    expect(spellsFlat('Bb')).toBe(true);
    expect(spellsFlat('Eb')).toBe(true);
    expect(spellsFlat('Ebm')).toBe(true);
  });

  it('does not, for a key written with a sharp', () => {
    expect(spellsFlat('F#m')).toBe(false);
    expect(spellsFlat('C#')).toBe(false);
  });

  it('knows the naturals whose signatures carry flats', () => {
    expect(spellsFlat('F')).toBe(true);
    expect(spellsFlat('Dm')).toBe(true);
    expect(spellsFlat('Gm')).toBe(true);
    expect(spellsFlat('C')).toBe(false);
    expect(spellsFlat('Am')).toBe(false);
    expect(spellsFlat('Bm')).toBe(false);
  });

  it('has no opinion when the set says nothing', () => {
    expect(spellsFlat('')).toBe(false);
    expect(spellsFlat('   ')).toBe(false);
  });
});

describe('pitchName', () => {
  it('names a note the way Live does, not the way a textbook does', () => {
    expect(pitchName(60)).toBe('C3');
    expect(pitchName(48)).toBe('C2');
    expect(pitchName(0)).toBe('C-2');
  });

  it('names the bottom of a bass', () => {
    // The two notes the roll is built around: a four-string's open E, and the
    // low B a five-string adds under it.
    expect(pitchName(28)).toBe('E0');
    expect(pitchName(23)).toBe('B-1');
  });

  it('spells the black keys to match the chart', () => {
    expect(pitchName(46)).toBe('A#1');
    expect(pitchName(46, true)).toBe('Bb1');
  });
});

/** A clip of `count` notes, spread and held as given. */
function clipOf(count: number, pitches: number[], duration: number): ChordNote[] {
  return Array.from({ length: count }, (_, i) => ({
    pitch: pitches[i % pitches.length]!,
    start: i * 0.25,
    duration,
  }));
}

describe('looksPercussive', () => {
  it("takes Live's own drum devices at their word", () => {
    expect(looksPercussive([], 4, 'DrumGroupDevice')).toBe(true);
    expect(looksPercussive([], 4, 'InstrumentImpulse')).toBe(true);
  });

  // The numbers below are from a real set, where the drum track reported
  // `PluginDevice` — indistinguishable from a synth by class alone — and was
  // being merged into every chord.
  it('hears a drum kit that calls itself a plugin', () => {
    // 131 notes over 8 bars, 4 pitch classes, spread 41 semitones, hits.
    const drums = clipOf(131, [21, 36, 38, 42, 62], 0.13);
    expect(looksPercussive(drums, 8, 'PluginDevice')).toBe(true);
  });

  it('leaves every musical part in the same set alone', () => {
    // Pad: 4 notes over 4 bars, held.
    expect(looksPercussive(clipOf(4, [60, 64, 67, 69], 16), 4, 'PluginDevice')).toBe(false);
    // Pluck: same shape, lower.
    expect(looksPercussive(clipOf(4, [48, 52, 55], 15.98), 4, 'InstrumentGroupDevice')).toBe(false);
    // Bass: 20 notes over 4 bars, short — but two pitch classes two semitones
    // apart, which is the opposite of a kit's spread.
    expect(looksPercussive(clipOf(20, [36, 38], 0.21), 4, 'InstrumentVector')).toBe(false);
  });

  it('needs all four signals, so any one alone is not enough', () => {
    // Dense and short, but a narrow spread: a hi-hat-only part would be, too,
    // and so would a tremolo. Not enough on its own.
    expect(looksPercussive(clipOf(80, [60, 62], 0.2), 4)).toBe(false);
    // Wide and sparse: a piano part covering the keyboard.
    expect(looksPercussive(clipOf(8, [36, 60, 84], 2), 4)).toBe(false);
    // Dense, wide, short — but every pitch class, so it is playing music. (The
    // obvious fixture for this, minor thirds up the keyboard, is four pitch
    // classes rather than twelve: a diminished cycle, which by these signals
    // really is shaped like a kit.)
    const chromatic = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 72];
    expect(looksPercussive(clipOf(80, chromatic, 0.2), 4)).toBe(false);
  });

  it('says nothing about a clip with no notes', () => {
    expect(looksPercussive([], 4, 'PluginDevice')).toBe(false);
  });
});

describe('how long the chart is', () => {
  it('contracts a four-bar progression written into an eight-bar clip', () => {
    const four = [
      ...triadAt(0, [57, 60, 64]),
      ...triadAt(1, [53, 57, 60]),
      ...triadAt(2, [48, 52, 55]),
      ...triadAt(3, [55, 59, 62]),
    ];
    const twice = [...four, ...four.map((n) => ({ ...n, start: n.start + 16 }))];

    const out = readProgression(twice, { from: 0, to: 32, ...BAR });
    expect(symbols(out)).toEqual(['Am', 'F', 'C', 'G']);
    expect(out[out.length - 1]!.to).toBe(16);
  });

  it('keeps a sixteen-bar progression at sixteen bars', () => {
    const notes = [];
    const roots = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    for (let bar = 0; bar < 16; bar++) {
      // Every fourth bar differs, so the sequence only repeats at sixteen.
      const tri = bar === 11 ? [50, 53, 57] : roots[bar % 4]!;
      notes.push(...triadAt(bar, tri));
    }
    const out = readProgression(notes, { from: 0, to: 64, ...BAR });
    expect(out[out.length - 1]!.to).toBe(64);
  });

  it('does not contract a song sitting on one chord to a single bar', () => {
    // True, and useless: nobody reads a one-bar chart, and how long you are on
    // the chord is part of what the chart is saying.
    const out = readProgression(chord(0, 32, [57, 60, 64]), { from: 0, to: 32, ...BAR });
    expect(symbols(out)).toEqual(['Am']);
    expect(out[0]!.to).toBe(16);
  });

  it('never contracts past a clip shorter than four bars', () => {
    const out = readProgression(chord(0, 8, [57, 60, 64]), { from: 0, to: 8, ...BAR });
    expect(out[0]!.to).toBe(8);
  });
});
