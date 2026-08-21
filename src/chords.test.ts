import { describe, expect, it } from 'vitest';
import { isPercussion, readProgression, spellsFlat, type ChordNote } from './chords.js';

/** A chord held for `duration` beats from `start`, as pitches. */
function chord(start: number, duration: number, pitches: number[]): ChordNote[] {
  return pitches.map((pitch) => ({ pitch, start, duration }));
}

const BAR = { beatsPerBar: 4, perBar: 2 };
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

describe('isPercussion', () => {
  it('knows Live\'s drum instruments', () => {
    expect(isPercussion('DrumGroupDevice')).toBe(true);
    expect(isPercussion('InstrumentImpulse')).toBe(true);
  });

  it('lets anything it does not recognise make chords', () => {
    // Guessing wrong this way leaves a chart incomplete; guessing wrong the
    // other way leaves it confidently misspelled.
    expect(isPercussion('Operator')).toBe(false);
    expect(isPercussion('PluginDevice')).toBe(false);
    expect(isPercussion('')).toBe(false);
  });
});
