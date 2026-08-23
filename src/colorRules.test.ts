import { describe, expect, it } from 'vitest';
import { planSongColors, type SongColorInput } from './colorRules.ts';

function songs(...spec: Array<[string, string, number | null]>): SongColorInput[] {
  return spec.map(([songKey, key, bpm]) => ({ songKey, key, bpm }));
}

const SET = songs(
  ['nightfall', 'Bm', 128],
  ['glass tunnel', 'F#m', 124],
  ['slow burn', 'Bm', 96],
  ['drift', '', null],
);

describe('planSongColors', () => {
  it('gives songs in the same key the same color', () => {
    const { colors } = planSongColors(SET, 'key', [10, 20, 30]);
    expect(colors.get('nightfall')).toBe(colors.get('slow burn'));
    expect(colors.get('glass tunnel')).not.toBe(colors.get('nightfall'));
  });

  it('reads a key case-insensitively, like every other identity here', () => {
    const { colors, legend } = planSongColors(
      songs(['a', 'Bm', null], ['b', 'bm', null]),
      'key',
      [7, 8],
    );
    expect(colors.get('a')).toBe(colors.get('b'));
    expect(legend).toHaveLength(1);
    // The spelling the set used first is what the legend shows.
    expect(legend[0]!.label).toBe('Bm');
  });

  it('walks the palette with the tempo, slowest first', () => {
    const { colors } = planSongColors(SET, 'bpm', [10, 20, 30]);
    expect(colors.get('slow burn')).toBe(10); // 96
    expect(colors.get('glass tunnel')).toBe(20); // 124
    expect(colors.get('nightfall')).toBe(30); // 128
  });

  it('leaves a song alone when the set never stated the fact', () => {
    // Not "the no-key color" — left as it is, and named, so the caller can say
    // so rather than quietly painting a song by a fact nobody wrote down.
    for (const rule of ['key', 'bpm'] as const) {
      const { colors, skipped } = planSongColors(SET, rule, [1, 2, 3]);
      expect(skipped).toEqual(['drift']);
      expect(colors.has('drift')).toBe(false);
    }
  });

  it('wraps on the number of groups, not the number of songs', () => {
    // Two colors, three keys: the third key comes back round to the first
    // color. What must not happen is the two songs sharing a key drifting
    // apart because the count ran on songs.
    const { colors } = planSongColors(
      songs(['a', 'Am', null], ['b', 'Bm', null], ['c', 'Am', null], ['d', 'Cm', null]),
      'key',
      [4, 5],
    );
    expect(colors.get('a')).toBe(4);
    expect(colors.get('c')).toBe(4);
    expect(colors.get('b')).toBe(5);
    expect(colors.get('d')).toBe(4);
  });

  it('rainbow gives every song the next color, in set order', () => {
    const { colors, skipped, legend } = planSongColors(SET, 'rainbow', [1, 2, 3]);
    expect([...colors.values()]).toEqual([1, 2, 3, 1]);
    // It needs no fact, so nothing can be missing one.
    expect(skipped).toEqual([]);
    expect(legend).toEqual([]);
  });

  it('random is the same roll for the same seed, and a different one otherwise', () => {
    // The preview and the write have to agree, which is the whole reason the
    // seed is an argument rather than Math.random() in here.
    const a = planSongColors(SET, 'random', [1, 2, 3, 4], 7).colors;
    const b = planSongColors(SET, 'random', [1, 2, 3, 4], 7).colors;
    const c = planSongColors(SET, 'random', [1, 2, 3, 4], 8).colors;
    expect([...a.values()]).toEqual([...b.values()]);
    expect([...a.values()]).not.toEqual([...c.values()]);
  });

  it('random never gives two songs in a row the same color', () => {
    // Dealt from a shuffled bag rather than drawn independently. A clump of one
    // color across three adjacent songs is what the band exists to prevent.
    const many = songs(...Array.from({ length: 40 }, (_, i) => [`s${i}`, '', null] as [string, string, null]));
    for (let seed = 0; seed < 20; seed++) {
      for (const allowed of [[1, 2], [1, 2, 3], [4, 5, 6, 7, 8]]) {
        const dealt = [...planSongColors(many, 'random', allowed, seed).colors.values()];
        expect(dealt).toHaveLength(40);
        expect(dealt.every((c, i) => i === 0 || c !== dealt[i - 1])).toBe(true);
      }
    }
  });

  it('random uses every allowed color before it repeats one', () => {
    const many = songs(...Array.from({ length: 8 }, (_, i) => [`s${i}`, '', null] as [string, string, null]));
    const dealt = [...planSongColors(many, 'random', [1, 2, 3, 4], 3).colors.values()];
    expect(new Set(dealt.slice(0, 4))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(dealt.slice(4))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('one allowed color is a legal answer, not a crash', () => {
    const { colors } = planSongColors(SET, 'random', [9], 1);
    expect([...colors.values()]).toEqual([9, 9, 9, 9]);
  });

  it('writes nothing at all when no color is allowed', () => {
    // Slot 0 is a real color, so an empty allowed list can't fall back to it.
    for (const rule of ['key', 'bpm', 'rainbow', 'random'] as const) {
      const { colors, skipped } = planSongColors(SET, rule, []);
      expect(colors.size).toBe(0);
      expect(skipped).toHaveLength(SET.length);
    }
  });

  it('reports what each key and tempo was given', () => {
    const { legend } = planSongColors(SET, 'key', [10, 20]);
    expect(legend).toEqual([
      { label: 'Bm', colorIndex: 10, songs: 2 },
      { label: 'F#m', colorIndex: 20, songs: 1 },
    ]);
  });
});
