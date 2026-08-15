import { describe, expect, it } from 'vitest';
import {
  allSongKeys,
  blockTrackRoles,
  mergeShapes,
  songRows,
} from './songRows.js';
import { derive, type Derivation, type SceneInput } from './derive.js';
import { buildSetModel } from './setModel.js';
import { compilePattern, SCENE_PATTERNS } from './namePattern.js';

/** The set's own pattern list, so this can't drift from what the app reads. */
const PATTERN = SCENE_PATTERNS;
const scene = (i: number, name: string, tempo = -1, colorIndex = -1): SceneInput => ({
  i,
  name,
  tempo,
  colorIndex,
});

/** The model the bridge would ship for a derivation, and the layout from it. */
const modelOf = (d: Derivation): BSV.SetModel => buildSetModel(d, 1);
const layoutOf = (d: Derivation, collapsed?: ReadonlySet<string>) =>
  songRows(modelOf(d), d.scenes.map((sc) => sc.s), collapsed);

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
    const { headers } = layoutOf(SET);
    expect([...headers.keys()].sort((a, b) => a - b)).toEqual([0, 3, 5]);
  });

  it('heads a reprise too, rather than leaving it under the previous song', () => {
    // Heading only the first block would visually attach scene 5 to Glass
    // Tunnel, which is the opposite of segmenting the grid.
    const h = layoutOf(SET).headers.get(5)!;
    expect(h).toMatchObject({ song: 'NIGHTFALL', block: 2, blocks: 2, from: 5, to: 5 });
  });

  it('numbers blocks and counts scenes per block, not per song', () => {
    const { headers } = layoutOf(SET);
    expect(headers.get(0)).toMatchObject({ block: 1, blocks: 2, scenes: 3 });
    expect(headers.get(3)).toMatchObject({ block: 1, blocks: 1, scenes: 2 });
  });

  it('carries the song facts as rendered strings', () => {
    expect(layoutOf(SET).headers.get(0)).toMatchObject({
      bpm: '128',
      key: 'Bm',
      tag: '',
      tempo: '',
      clash: false,
    });
  });

  it('carries a song tag into every block header', () => {
    const d = derive(
      [
        scene(0, '[A] @Bm NIGHTFALL {COVER}'),
        scene(1, '[B] @Bm NIGHTFALL {COVER}'),
      ],
      PATTERN,
    );
    expect(layoutOf(d).headers.get(0)).toMatchObject({ tag: 'COVER', tagClash: false });
  });

  it('carries the artist, and marks a disagreement like the tag does', () => {
    // Its own flag rather than folding into `clash`: that one annotates the
    // bpm/key strip, and the artist sits with the name.
    const agreed = derive(
      [
        scene(0, '[A] @Bm NIGHTFALL - THE AVIATORS'),
        scene(1, '[B] @Bm NIGHTFALL - THE AVIATORS'),
      ],
      PATTERN,
    );
    expect(layoutOf(agreed).headers.get(0)).toMatchObject({
      artist: 'THE AVIATORS',
      artistClash: false,
    });

    const split = derive(
      [
        scene(0, '[A] @Bm NIGHTFALL - THE AVIATORS'),
        scene(1, '[B] @Bm NIGHTFALL - SUN & STEEL'),
      ],
      PATTERN,
    );
    expect(layoutOf(split).headers.get(0)).toMatchObject({
      artist: 'THE AVIATORS / SUN & STEEL',
      artistClash: true,
      clash: false,
    });
  });

  it('marks a tag disagreement without marking the musical facts', () => {
    const d = derive(
      [
        scene(0, '[A] @Bm NIGHTFALL {COVER}'),
        scene(1, '[B] @Bm NIGHTFALL {ORIGINAL}'),
      ],
      PATTERN,
    );
    expect(layoutOf(d).headers.get(0)).toMatchObject({
      tag: 'COVER / ORIGINAL',
      tagClash: true,
      clash: false,
    });
  });

  it('uses the first scene’s explicit tempo when the names omit bpm', () => {
    const unanimous = derive(
      [scene(0, '[A] NIGHTFALL', 128), scene(1, '[B] NIGHTFALL', 128)],
      PATTERN,
    );
    const partial = derive(
      [scene(0, '[A] NIGHTFALL', 128), scene(1, '[B] NIGHTFALL')],
      PATTERN,
    );
    // A song that speeds up is a song. The header answers what it is entered
    // at, which is the first scene's tempo in all three of these.
    const mixed = derive(
      [scene(0, '[A] NIGHTFALL', 128), scene(1, '[B] NIGHTFALL', 130)],
      PATTERN,
    );
    expect(layoutOf(unanimous).headers.get(0)?.bpm).toBe('128');
    expect(layoutOf(partial).headers.get(0)?.bpm).toBe('128');
    expect(layoutOf(mixed).headers.get(0)?.bpm).toBe('128');
  });

  it('infers no bpm when the first scene follows the Live Set tempo', () => {
    const d = derive(
      [scene(0, '[A] NIGHTFALL'), scene(1, '[B] NIGHTFALL', 128)],
      PATTERN,
    );
    expect(layoutOf(d).headers.get(0)?.bpm).toBe('');
  });

  it('keeps a bpm stated in the names ahead of the extracted fallback', () => {
    const d = derive(
      [scene(0, '[A] @126 NIGHTFALL', 128), scene(1, '[B] @126 NIGHTFALL', 128)],
      PATTERN,
    );
    expect(layoutOf(d).headers.get(0)?.bpm).toBe('126');
  });

  it('carries the song color when its scenes agree on one', () => {
    const d = derive(
      [
        scene(0, '[A] @128-Bm NIGHTFALL', -1, 14),
        scene(1, '[B] @128-Bm NIGHTFALL', -1, 14),
      ],
      PATTERN,
    );
    expect(layoutOf(d).headers.get(0)).toMatchObject({
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
    expect(layoutOf(d).headers.get(0)).toMatchObject({
      colorIndex: -1,
      colorClash: true,
    });
  });

  it('leaves an uncolored song uncolored rather than clashing', () => {
    expect(layoutOf(SET).headers.get(0)).toMatchObject({
      colorIndex: -1,
      colorClash: false,
    });
  });

  it('renders a disagreement as every value, and flags it', () => {
    const d = derive(
      [scene(0, '[A] @128-Bm NIGHTFALL'), scene(1, '[B] @130-Bm NIGHTFALL')],
      PATTERN,
    );
    const h = layoutOf(d).headers.get(0)!;
    expect(h.bpm).toBe('128 / 130');
    expect(h.clash).toBe(true);
  });

  it('leaves a fact the set never states empty rather than inventing one', () => {
    const d = derive([scene(0, '[INTRO] NIGHTFALL')], PATTERN);
    expect(layoutOf(d).headers.get(0)).toMatchObject({ bpm: '', key: '', tempo: '' });
  });

  it('has no header for a scene the pattern could not read', () => {
    const strict = compilePattern('{song} {bpm} {key}')!;
    const d = derive([scene(0, 'Audio 3'), scene(1, 'Nightfall 128 Bm')], strict);
    const { headers } = layoutOf(d);
    expect(headers.has(0)).toBe(false);
    expect(headers.has(1)).toBe(true);
  });
});

describe('collapsing', () => {
  it('shows every scene when nothing is collapsed', () => {
    const { hidden, rows } = layoutOf(SET);
    expect(hidden.size).toBe(0);
    expect(rows).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hides a collapsed song’s scenes but keeps its header', () => {
    const { hidden, rows, headers } = layoutOf(SET, new Set(['glass tunnel']));
    expect([...hidden].sort()).toEqual([3, 4]);
    expect(rows).toEqual([0, 1, 2, 5]);
    expect(headers.get(3)!.collapsed).toBe(true);
  });

  it('folds every block of a song at once, and shows a header for each', () => {
    // Collapsing "Nightfall" has to take the reprise with it — folding one and
    // leaving the other is not what "collapse this song" means.
    const { hidden, rows, headers } = layoutOf(SET, new Set(['nightfall']));
    expect([...hidden].sort((a, b) => a - b)).toEqual([0, 1, 2, 5]);
    expect(rows).toEqual([3, 4]);
    expect(headers.get(0)!.collapsed).toBe(true);
    expect(headers.get(5)!.collapsed).toBe(true);
  });

  it('leaves no rows when everything is collapsed, and every header standing', () => {
    const { rows, headers } = layoutOf(SET, new Set(allSongKeys(modelOf(SET))));
    expect(rows).toEqual([]);
    expect(headers.size).toBe(3);
  });

  it('matches the collapsed set case-insensitively, like songKey', () => {
    expect(layoutOf(SET, new Set(['nightfall'])).hidden.size).toBe(4);
  });

  it('never hides a scene the pattern could not read', () => {
    // An unmapped scene belongs to no song, so nothing can fold it away and
    // leave it unreachable.
    const strict = compilePattern('{song} {bpm} {key}')!;
    const d = derive([scene(0, 'Nightfall 128 Bm'), scene(1, 'Audio 3')], strict);
    const { rows } = layoutOf(d, new Set(allSongKeys(modelOf(d))));
    expect(rows).toEqual([1]);
  });
});

describe('blockTrackRoles', () => {
  /** Nightfall over scenes 0–2, Glass Tunnel 3–4, Nightfall again at 5. */
  const BLOCKS = [
    { from: 0, to: 2 },
    { from: 3, to: 4 },
    { from: 5, to: 5 },
  ];
  const NAMES = [
    { i: 0, name: '[INTRO] NIGHTFALL' },
    { i: 1, name: '[VERSE] NIGHTFALL' },
    { i: 2, name: '[CHORUS] NIGHTFALL' },
    { i: 3, name: '[INTRO] GLASS TUNNEL' },
    { i: 4, name: '[VERSE] GLASS TUNNEL' },
    { i: 5, name: '[CHORUS] NIGHTFALL' },
  ];

  it('says which sections of the song each track plays', () => {
    // The point of the whole function: not that the pad is used, but that it's
    // used in the choruses.
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 0 },
        { t: 0, s: 2 },
        { t: 4, s: 1 },
      ],
      NAMES,
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles).toEqual([
      { name: 'INTRO', scenes: 1 },
      { name: 'CHORUS', scenes: 1 },
    ]);
    expect(shapes.get(0)!.get(4)!.roles).toEqual([{ name: 'VERSE', scenes: 1 }]);
    expect(shapes.get(0)!.get(0)!.slots).toEqual([
      { role: 'INTRO' },
      null,
      { role: 'CHORUS' },
    ]);
    expect(shapes.get(0)!.get(4)!.slots).toEqual([null, { role: 'VERSE' }, null]);
  });

  it('orders roles by scene, not by the order clips arrived in', () => {
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 2 },
        { t: 0, s: 0 },
      ],
      NAMES,
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles.map((r) => r.name)).toEqual(['INTRO', 'CHORUS']);
  });

  it('counts the scenes of each role rather than repeating it', () => {
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 0 },
        { t: 0, s: 1 },
        { t: 0, s: 2 },
      ],
      [
        { i: 0, name: '[CHORUS] NIGHTFALL' },
        { i: 1, name: '[CHORUS] NIGHTFALL' },
        { i: 2, name: '[VERSE] NIGHTFALL' },
      ],
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles).toEqual([
      { name: 'CHORUS', scenes: 2 },
      { name: 'VERSE', scenes: 1 },
    ]);
  });

  it('folds case and keeps the spelling from the earliest scene', () => {
    // Earliest scene, not first clip seen — the snapshot walks tracks, so a
    // later scene's spelling can arrive first.
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 1 },
        { t: 0, s: 0 },
      ],
      [
        { i: 0, name: '[Chorus] NIGHTFALL' },
        { i: 1, name: '[CHORUS] NIGHTFALL' },
      ],
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles).toEqual([{ name: 'Chorus', scenes: 2 }]);
  });

  it('counts clips on untagged scenes separately, and still counts them', () => {
    // A set mid-mapping is mostly untagged scenes. A track used only there has
    // to still read as used, or the header lies about what the song contains.
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 0 },
        { t: 0, s: 1 },
      ],
      [
        { i: 0, name: 'NIGHTFALL' },
        { i: 1, name: '[VERSE] NIGHTFALL' },
      ],
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)).toEqual({
      roles: [{ name: 'VERSE', scenes: 1 }],
      untagged: 1,
      scenes: 2,
      slots: [{ role: null }, { role: 'VERSE' }, null],
    });
  });

  it('reads roles by tag, not by the pattern that named the scene', () => {
    // The premise: a pattern that reads this whole name as one long title. The
    // tag is still visibly there and the scene row shows a chip for it.
    const title = compilePattern('{song}')!;
    expect(derive([scene(0, 'NIGHTFALL [alt mix]')], title).scenes[0]!.role).toBe(null);
    const shapes = blockTrackRoles(
      [{ t: 0, s: 0 }],
      [{ i: 0, name: 'NIGHTFALL [alt mix]' }],
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles.map((r) => r.name)).toEqual(['alt mix']);
  });

  it('gives a track with nothing in the block no entry at all', () => {
    // Absence is the answer, and the column draws nothing for it.
    const shapes = blockTrackRoles([{ t: 0, s: 0 }], NAMES, BLOCKS);
    expect(shapes.get(0)!.get(7)).toBeUndefined();
    expect(shapes.get(3)!.size).toBe(0);
  });

  it('keeps a reprise separate from the first run', () => {
    const shapes = blockTrackRoles(
      [
        { t: 0, s: 0 },
        { t: 0, s: 5 },
      ],
      NAMES,
      BLOCKS,
    );
    expect(shapes.get(0)!.get(0)!.roles.map((r) => r.name)).toEqual(['INTRO']);
    expect(shapes.get(5)!.get(0)!.roles.map((r) => r.name)).toEqual(['CHORUS']);
  });

  it('ignores a clip in a scene no block owns', () => {
    const shapes = blockTrackRoles([{ t: 0, s: 99 }], NAMES, BLOCKS);
    expect([...shapes.values()].every((m) => m.size === 0)).toBe(true);
  });

  it('has an entry for every block, and only for blocks', () => {
    expect([...blockTrackRoles([], NAMES, BLOCKS).keys()]).toEqual([0, 3, 5]);
    expect(blockTrackRoles([], NAMES, []).size).toBe(0);
  });

  it('takes its blocks straight off a derivation', () => {
    const shapes = blockTrackRoles(
      [{ t: 2, s: 4 }],
      NAMES,
      SET.songs.flatMap((s) => s.blocks),
    );
    expect(shapes.get(3)!.get(2)!.scenes).toBe(1);
  });
});

describe('mergeShapes', () => {
  it('sums a folded group of tracks into one shape', () => {
    const merged = mergeShapes([
      {
        roles: [{ name: 'CHORUS', scenes: 2 }],
        untagged: 1,
        scenes: 3,
        slots: [{ role: 'CHORUS' }, null, { role: null }, null, null],
      },
      {
        roles: [
          { name: 'chorus', scenes: 1 },
          { name: 'VERSE', scenes: 4 },
        ],
        untagged: 0,
        scenes: 5,
        slots: [
          { role: 'chorus' },
          { role: 'VERSE' },
          null,
          { role: 'VERSE' },
          { role: 'VERSE' },
        ],
      },
    ]);
    expect(merged).toEqual({
      roles: [
        { name: 'CHORUS', scenes: 3 },
        { name: 'VERSE', scenes: 4 },
      ],
      untagged: 1,
      scenes: 8,
      slots: [
        { role: 'CHORUS' },
        { role: 'VERSE' },
        { role: null },
        { role: 'VERSE' },
        { role: 'VERSE' },
      ],
    });
  });

  it('does not mutate the shapes it was given', () => {
    // They're the memoized map's own objects — a group column rendering twice
    // would otherwise double every count it shows.
    const one = {
      roles: [{ name: 'CHORUS', scenes: 2 }],
      untagged: 0,
      scenes: 2,
      slots: [{ role: 'CHORUS' }, { role: 'CHORUS' }],
    };
    mergeShapes([one, one]);
    expect(one.roles[0]!.scenes).toBe(2);
    expect(one.slots).toEqual([{ role: 'CHORUS' }, { role: 'CHORUS' }]);
  });

  it('is an empty shape for a group with nothing in it', () => {
    expect(mergeShapes([])).toEqual({ roles: [], untagged: 0, scenes: 0, slots: [] });
  });
});

describe('allSongKeys', () => {
  it('is every song, deduped by the same identity songRows uses', () => {
    expect(allSongKeys(modelOf(SET))).toEqual(['nightfall', 'glass tunnel']);
  });

  it('is empty for a set with no songs', () => {
    expect(allSongKeys(modelOf(derive([], PATTERN)))).toEqual([]);
  });
});
