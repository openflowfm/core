import { describe, expect, it } from 'vitest';
import { allSongKeys, songRows } from './songRows.js';
import { derive, type SceneInput } from './derive.js';
import { compilePattern, DEFAULT_SCENE_PATTERN } from './namePattern.js';

const PATTERN = compilePattern(DEFAULT_SCENE_PATTERN)!;
const scene = (i: number, name: string, tempo = -1): SceneInput => ({ i, name, tempo });

/** Two songs back to back, then the first one again as a reprise. */
const SET = derive(
  [
    scene(0, 'Nightfall 128 Bm [intro]'),
    scene(1, 'Nightfall 128 Bm [verse]'),
    scene(2, 'Nightfall 128 Bm [chorus]'),
    scene(3, 'Glass Tunnel 124 F#m [intro]'),
    scene(4, 'Glass Tunnel 124 F#m [verse]'),
    scene(5, 'Nightfall 128 Bm [outro]'),
  ],
  PATTERN,
);

describe('headers', () => {
  it('puts one above the first scene of every block', () => {
    const { headers } = songRows(SET);
    expect([...headers.keys()].sort((a, b) => a - b)).toEqual([0, 3, 5]);
  });

  it('heads a reprise too, rather than leaving it under the previous song', () => {
    // Heading only the first block would visually attach scene 5 to Glass
    // Tunnel, which is the opposite of segmenting the grid.
    const h = songRows(SET).headers.get(5)!;
    expect(h).toMatchObject({ song: 'Nightfall', block: 2, blocks: 2, from: 5, to: 5 });
  });

  it('numbers blocks and counts scenes per block, not per song', () => {
    const { headers } = songRows(SET);
    expect(headers.get(0)).toMatchObject({ block: 1, blocks: 2, scenes: 3 });
    expect(headers.get(3)).toMatchObject({ block: 1, blocks: 1, scenes: 2 });
  });

  it('carries the song facts as rendered strings', () => {
    expect(songRows(SET).headers.get(0)).toMatchObject({
      bpm: '128',
      key: 'Bm',
      tempo: '',
      clash: false,
    });
  });

  it('renders a disagreement as every value, and flags it', () => {
    const d = derive(
      [scene(0, 'Nightfall 128 Bm [a]'), scene(1, 'Nightfall 130 Bm [b]')],
      PATTERN,
    );
    const h = songRows(d).headers.get(0)!;
    expect(h.bpm).toBe('128 / 130');
    expect(h.clash).toBe(true);
  });

  it('leaves a fact the set never states empty rather than inventing one', () => {
    const d = derive([scene(0, 'Nightfall [intro]')], PATTERN);
    expect(songRows(d).headers.get(0)).toMatchObject({ bpm: '', key: '', tempo: '' });
  });

  it('has no header for a scene the pattern could not read', () => {
    const strict = compilePattern('{song} {bpm} {key}')!;
    const d = derive([scene(0, 'Audio 3'), scene(1, 'Nightfall 128 Bm')], strict);
    const { headers } = songRows(d);
    expect(headers.has(0)).toBe(false);
    expect(headers.has(1)).toBe(true);
  });
});

describe('collapsing', () => {
  it('shows every scene when nothing is collapsed', () => {
    const { hidden, rows } = songRows(SET);
    expect(hidden.size).toBe(0);
    expect(rows).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hides a collapsed song’s scenes but keeps its header', () => {
    const { hidden, rows, headers } = songRows(SET, new Set(['glass tunnel']));
    expect([...hidden].sort()).toEqual([3, 4]);
    expect(rows).toEqual([0, 1, 2, 5]);
    expect(headers.get(3)!.collapsed).toBe(true);
  });

  it('folds every block of a song at once, and shows a header for each', () => {
    // Collapsing "Nightfall" has to take the reprise with it — folding one and
    // leaving the other is not what "collapse this song" means.
    const { hidden, rows, headers } = songRows(SET, new Set(['nightfall']));
    expect([...hidden].sort((a, b) => a - b)).toEqual([0, 1, 2, 5]);
    expect(rows).toEqual([3, 4]);
    expect(headers.get(0)!.collapsed).toBe(true);
    expect(headers.get(5)!.collapsed).toBe(true);
  });

  it('leaves no rows when everything is collapsed, and every header standing', () => {
    const { rows, headers } = songRows(SET, new Set(allSongKeys(SET)));
    expect(rows).toEqual([]);
    expect(headers.size).toBe(3);
  });

  it('matches the collapsed set case-insensitively, like songKey', () => {
    expect(songRows(SET, new Set(['nightfall'])).hidden.size).toBe(4);
  });

  it('never hides a scene the pattern could not read', () => {
    // An unmapped scene belongs to no song, so nothing can fold it away and
    // leave it unreachable.
    const strict = compilePattern('{song} {bpm} {key}')!;
    const d = derive([scene(0, 'Nightfall 128 Bm'), scene(1, 'Audio 3')], strict);
    const { rows } = songRows(d, new Set(allSongKeys(d)));
    expect(rows).toEqual([1]);
  });
});

describe('allSongKeys', () => {
  it('is every song, deduped by the same identity songRows uses', () => {
    expect(allSongKeys(SET)).toEqual(['nightfall', 'glass tunnel']);
  });

  it('is empty for a set with no songs', () => {
    expect(allSongKeys(derive([], PATTERN))).toEqual([]);
  });
});
