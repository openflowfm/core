import { describe, expect, it } from 'vitest';
import { allSongKeys, blockFills, songRows } from './songRows.js';
import { derive, type SceneInput } from './derive.js';
import { compilePattern, DEFAULT_SCENE_PATTERN } from './namePattern.js';

const PATTERN = compilePattern(DEFAULT_SCENE_PATTERN)!;
const scene = (i: number, name: string, tempo = -1, colorIndex = -1): SceneInput => ({
  i,
  name,
  tempo,
  colorIndex,
});

/** Two songs back to back, then the first one again as a reprise. */
const SET = derive(
  [
    scene(0, '[INTRO] @128-Bm NIGHTFALL'),
    scene(1, '[VERSE] @128-Bm NIGHTFALL'),
    scene(2, '[CHORUS] @128-Bm NIGHTFALL'),
    scene(3, '[INTRO] @124-F#m GLASS TUNNEL'),
    scene(4, '[VERSE] @124-F#m GLASS TUNNEL'),
    scene(5, '[OUTRO] @128-Bm NIGHTFALL'),
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
    expect(h).toMatchObject({ song: 'NIGHTFALL', block: 2, blocks: 2, from: 5, to: 5 });
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

  it('carries the song color when its scenes agree on one', () => {
    const d = derive(
      [
        scene(0, '[A] @128-Bm NIGHTFALL', -1, 14),
        scene(1, '[B] @128-Bm NIGHTFALL', -1, 14),
      ],
      PATTERN,
    );
    expect(songRows(d).headers.get(0)).toMatchObject({
      colorIndex: 14,
      colorClash: false,
    });
  });

  it('refuses to show a color the whole song does not carry', () => {
    // Painting the header from the first scene would state a song color the
    // block behind it disagrees with.
    const d = derive(
      [
        scene(0, '[A] @128-Bm NIGHTFALL', -1, 14),
        scene(1, '[B] @128-Bm NIGHTFALL', -1, 41),
      ],
      PATTERN,
    );
    expect(songRows(d).headers.get(0)).toMatchObject({
      colorIndex: -1,
      colorClash: true,
    });
  });

  it('leaves an uncolored song uncolored rather than clashing', () => {
    expect(songRows(SET).headers.get(0)).toMatchObject({
      colorIndex: -1,
      colorClash: false,
    });
  });

  it('renders a disagreement as every value, and flags it', () => {
    const d = derive(
      [scene(0, '[A] @128-Bm NIGHTFALL'), scene(1, '[B] @130-Bm NIGHTFALL')],
      PATTERN,
    );
    const h = songRows(d).headers.get(0)!;
    expect(h.bpm).toBe('128 / 130');
    expect(h.clash).toBe(true);
  });

  it('leaves a fact the set never states empty rather than inventing one', () => {
    const d = derive([scene(0, '[INTRO] NIGHTFALL')], PATTERN);
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

describe('blockFills', () => {
  /** Nightfall over scenes 0–2, Glass Tunnel 3–4, Nightfall again at 5. */
  const BLOCKS = [
    { from: 0, to: 2 },
    { from: 3, to: 4 },
    { from: 5, to: 5 },
  ];

  it('counts, per block, how many of its scenes hold a clip in each track', () => {
    const fills = blockFills(
      [
        { t: 0, s: 0 },
        { t: 0, s: 1 },
        { t: 0, s: 2 },
        { t: 4, s: 1 },
      ],
      BLOCKS,
    );
    expect([...fills.get(0)!]).toEqual([
      [0, 3],
      [4, 1],
    ]);
  });

  it('gives an empty map to a block whose scenes hold nothing', () => {
    // Not `undefined` — a folded song with no clips is a real answer, and the
    // strip should read as empty rather than as missing.
    const fills = blockFills([{ t: 0, s: 0 }], BLOCKS);
    expect(fills.get(3)).toEqual(new Map());
  });

  it('keeps a reprise separate from the first run', () => {
    // Both blocks are the same song and fold together, but a reprise that drops
    // the pads is exactly what a second header is there to show.
    const fills = blockFills(
      [
        { t: 0, s: 0 },
        { t: 7, s: 0 },
        { t: 0, s: 5 },
      ],
      BLOCKS,
    );
    expect([...fills.get(0)!.keys()].sort((a, b) => a - b)).toEqual([0, 7]);
    expect([...fills.get(5)!.keys()]).toEqual([0]);
  });

  it('ignores a clip in a scene no block owns', () => {
    const fills = blockFills([{ t: 0, s: 99 }], BLOCKS);
    expect([...fills.values()].every((m) => m.size === 0)).toBe(true);
  });

  it('has an entry for every block, and only for blocks', () => {
    expect([...blockFills([], BLOCKS).keys()]).toEqual([0, 3, 5]);
    expect(blockFills([], []).size).toBe(0);
  });

  it('takes its blocks straight off a derivation', () => {
    const fills = blockFills(
      [{ t: 2, s: 4 }],
      SET.songs.flatMap((s) => s.blocks),
    );
    expect(fills.get(3)!.get(2)).toBe(1);
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
