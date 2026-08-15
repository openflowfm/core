import { describe, expect, it } from 'vitest';
import {
  blocksOf,
  derive,
  disagreements,
  MIN_TEMPO,
  scenesOfSongs,
  songByScene,
  songKey,
  songsOfScenes,
  type SceneInput,
} from './derive.js';
import {
  BPM_SCENE_PATTERN,
  compilePattern,
  DEFAULT_SCENE_PATTERN,
  LEADING_TAG_SCENE_PATTERN,
  LEGACY_SCENE_PATTERN,
} from './namePattern.js';

const PATTERN = compilePattern('{song} {bpm?} {key?} [{role?}]')!;

/** Scene with no tempo and no color of its own — Live answers -1 for both. */
const scene = (i: number, name: string, tempo = -1, colorIndex = -1): SceneInput => ({
  i,
  name,
  tempo,
  colorIndex,
});

describe('blocksOf', () => {
  it('groups consecutive scenes into one run', () => {
    expect(blocksOf([10, 11, 12])).toEqual([{ from: 10, to: 12 }]);
  });

  it('splits on a gap', () => {
    expect(blocksOf([10, 11, 88, 89])).toEqual([
      { from: 10, to: 11 },
      { from: 88, to: 89 },
    ]);
  });

  it('handles a lone scene and an empty list', () => {
    expect(blocksOf([5])).toEqual([{ from: 5, to: 5 }]);
    expect(blocksOf([])).toEqual([]);
  });
});

describe('songKey', () => {
  it('matches case-insensitively so a shift key does not split a song', () => {
    expect(songKey('Nightfall')).toBe(songKey('nightfall'));
    expect(songKey('  Glass   Tunnel ')).toBe('glass tunnel');
  });
});

describe('derive', () => {
  const SCENES = [
    scene(0, 'Nightfall 128 Bm [intro]'),
    scene(1, 'Nightfall 128 Bm [verse]'),
    scene(2, 'Nightfall 128 Bm [chorus]'),
    scene(3, 'Glass Tunnel 124 F#m [intro]'),
    scene(4, 'Audio 3'),
  ];

  it('reads song and role out of every matching name', () => {
    const d = derive(SCENES, PATTERN);
    expect(d.scenes[0]).toEqual({
      s: 0,
      name: 'Nightfall 128 Bm [intro]',
      fields: { song: 'Nightfall', bpm: '128', key: 'Bm', role: 'intro' },
      song: 'Nightfall',
      artist: null,
      tag: null,
      role: 'intro',
      tempo: null,
    });
  });

  it('groups scenes into songs in order of first appearance', () => {
    const d = derive(SCENES, PATTERN);
    expect(d.songs.map((s) => s.name)).toEqual(['Nightfall', 'Glass Tunnel', 'Audio 3']);
    expect(d.songs[0]!.scenes).toEqual([0, 1, 2]);
  });

  it('records what the set says each song is', () => {
    const d = derive(SCENES, PATTERN);
    expect(d.songs[0]!.observed).toEqual({
      bpm: ['128'],
      key: ['Bm'],
      artist: [],
      tag: [],
      tempo: [],
      colorIndex: [-1],
    });
  });

  it('treats a name with no bpm or key as the song alone, not as unmapped', () => {
    // "Audio 3" matches {song} with everything optional absent. That is a real
    // mapping — the scene claims a song called "Audio 3" — and the mapping pass
    // is where you'd correct it.
    const d = derive(SCENES, PATTERN);
    expect(d.unmapped).toEqual([]);
    expect(d.songs[2]).toMatchObject({ name: 'Audio 3', scenes: [4] });
  });

  it('sorts by scene index rather than trusting input order', () => {
    const d = derive([scene(2, 'A [x]'), scene(0, 'A [y]'), scene(1, 'A [z]')], PATTERN);
    expect(d.scenes.map((s) => s.s)).toEqual([0, 1, 2]);
    expect(d.songs[0]!.scenes).toEqual([0, 1, 2]);
  });

  it('is empty for an empty set', () => {
    expect(derive([], PATTERN)).toEqual({ scenes: [], songs: [], unmapped: [] });
  });
});

describe('unmapped scenes', () => {
  // A pattern with a required field is what makes non-conforming names fail to
  // parse at all, which is the state the mapping pass exists to clear.
  const strict = compilePattern('{song} {bpm} {key}')!;

  it('lists scenes whose names do not match the pattern', () => {
    const d = derive(
      [scene(0, 'Nightfall 128 Bm'), scene(1, 'Audio 3'), scene(2, '')],
      strict,
    );
    expect(d.unmapped).toEqual([1, 2]);
    expect(d.songs.map((s) => s.name)).toEqual(['Nightfall']);
  });

  it('gives an unmapped scene null fields rather than a partial reading', () => {
    const d = derive([scene(0, 'Audio 3')], strict);
    expect(d.scenes[0]!.fields).toBeNull();
    expect(d.scenes[0]!.song).toBeNull();
    expect(d.scenes[0]!.role).toBeNull();
  });
});

describe('reprises', () => {
  it('keeps one song across separate blocks', () => {
    const d = derive(
      [
        scene(10, 'Nightfall [intro]'),
        scene(11, 'Nightfall [verse]'),
        scene(12, 'Glass Tunnel [intro]'),
        scene(88, 'Nightfall [outro]'),
      ],
      PATTERN,
    );
    const nightfall = d.songs.find((s) => s.name === 'Nightfall')!;
    expect(nightfall.scenes).toEqual([10, 11, 88]);
    expect(nightfall.blocks).toEqual([
      { from: 10, to: 11 },
      { from: 88, to: 88 },
    ]);
  });

  it('folds a differently-cased spelling into the same song, keeping the first', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]'), scene(1, 'NIGHTFALL [verse]')],
      PATTERN,
    );
    expect(d.songs).toHaveLength(1);
    expect(d.songs[0]!.name).toBe('Nightfall');
    expect(d.songs[0]!.scenes).toEqual([0, 1]);
  });
});

describe('scene tempo', () => {
  it('reads a real tempo off the scene', () => {
    const d = derive([scene(0, 'Nightfall [intro]', 128)], PATTERN);
    expect(d.scenes[0]!.tempo).toBe(128);
    expect(d.songs[0]!.observed.tempo).toEqual([128]);
  });

  it('treats -1 and 0 alike as "no tempo of its own"', () => {
    // -1 is what Live documents; 0 is what gnum answers for a property it could
    // not read. A range check can't be caught out by which one arrived.
    for (const t of [-1, 0]) {
      const d = derive([scene(0, 'Nightfall [intro]', t)], PATTERN);
      expect(d.scenes[0]!.tempo, String(t)).toBeNull();
      expect(d.songs[0]!.observed.tempo, String(t)).toEqual([]);
    }
  });

  it('rejects anything below Live’s own lower bound', () => {
    expect(derive([scene(0, 'A', MIN_TEMPO - 1)], PATTERN).scenes[0]!.tempo).toBeNull();
    expect(derive([scene(0, 'A', MIN_TEMPO)], PATTERN).scenes[0]!.tempo).toBe(MIN_TEMPO);
  });

  it('reads the song’s tempo off its first scene', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]', 128), scene(1, 'Nightfall [verse]')],
      PATTERN,
    );
    expect(d.songs[0]!.firstSceneTempo).toBe(128);
    expect(d.songs[0]!.tempoScenes).toEqual([0]);
  });

  it('has no tempo when the first scene follows the Live Set', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]'), scene(1, 'Nightfall [verse]', 128)],
      PATTERN,
    );
    expect(d.songs[0]!.firstSceneTempo).toBeNull();
    // The later scene still reports, because clearing it is an action the app
    // offers and it needs to know the scene is there.
    expect(d.songs[0]!.tempoScenes).toEqual([1]);
  });

  it('keeps the first scene’s tempo when a later one disagrees', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]', 128), scene(1, 'Nightfall [verse]', 130)],
      PATTERN,
    );
    // A song that speeds up is a song, not a data error — the answer is what
    // the song is entered at, and `tempoScenes` is what says it changes.
    expect(d.songs[0]!.firstSceneTempo).toBe(128);
    expect(d.songs[0]!.tempoScenes).toEqual([0, 1]);
  });

  it('takes the first scene of the first block, reprises included', () => {
    const d = derive(
      [
        scene(0, 'Nightfall [intro]', 128),
        scene(1, 'Another Song [intro]', 120),
        scene(2, 'Nightfall [outro]', 130),
      ],
      PATTERN,
    );
    expect(d.songs[0]!.blocks).toHaveLength(2);
    expect(d.songs[0]!.firstSceneTempo).toBe(128);
    expect(d.songs[0]!.tempoScenes).toEqual([0, 2]);
  });
});

describe('the artist', () => {
  const CURRENT = compilePattern(DEFAULT_SCENE_PATTERN)!;

  it('is read off the name and observed like the other facts', () => {
    const d = derive(
      [
        scene(0, '[INTRO] @Bm NIGHTFALL - THE AVIATORS'),
        scene(1, '[VERSE] @Bm NIGHTFALL - THE AVIATORS'),
      ],
      CURRENT,
    );
    expect(d.scenes[0]!.artist).toBe('THE AVIATORS');
    expect(d.songs[0]!.observed.artist).toEqual(['THE AVIATORS']);
  });

  it('is not part of song identity — one song, two artists is a disagreement', () => {
    // The deliberate choice: `songKey` folds the name alone, so a set naming
    // two artists for one title reports drift rather than quietly becoming two
    // songs the library would then have to be taught to tell apart.
    const d = derive(
      [
        scene(0, 'NIGHTFALL - THE AVIATORS'),
        scene(1, 'NIGHTFALL - SUN & STEEL'),
      ],
      CURRENT,
    );
    expect(d.songs).toHaveLength(1);
    expect(d.songs[0]!.scenes).toEqual([0, 1]);
    expect(disagreements(d)).toContainEqual({
      song: 'NIGHTFALL',
      field: 'artist',
      values: ['THE AVIATORS', 'SUN & STEEL'],
    });
  });

  it('collects a half-named song into one entry, so a rename can finish it', () => {
    const d = derive(
      [scene(0, 'NIGHTFALL - THE AVIATORS'), scene(1, 'NIGHTFALL')],
      CURRENT,
    );
    expect(d.songs).toHaveLength(1);
    // An unstated artist is an omission, not a value — the same rule bpm and
    // key follow, and the opposite of colorIndex.
    expect(d.songs[0]!.observed.artist).toEqual(['THE AVIATORS']);
  });
});

describe('song color', () => {
  it('records one slot when every scene of the song carries it', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]', -1, 14), scene(1, 'Nightfall [verse]', -1, 14)],
      PATTERN,
    );
    expect(d.songs[0]!.observed.colorIndex).toEqual([14]);
  });

  it('counts "no color" as a value, so a half-painted song disagrees', () => {
    // The one case a song-scoped color rule exists to catch. Treating -1 as an
    // omission the way an unwritten {key} is would hide it.
    const d = derive(
      [scene(0, 'Nightfall [intro]', -1, 14), scene(1, 'Nightfall [verse]', -1, -1)],
      PATTERN,
    );
    expect(d.songs[0]!.observed.colorIndex).toEqual([14, -1]);
    expect(disagreements(d)).toEqual([
      { song: 'Nightfall', field: 'color', values: ['14', 'none'] },
    ]);
  });
});

describe('scenesOfSongs', () => {
  const SET = derive(
    [
      scene(0, 'Nightfall [intro]'),
      scene(1, 'Nightfall [verse]'),
      scene(2, 'Glass Tunnel [intro]'),
      scene(3, 'Nightfall [outro]'),
    ],
    PATTERN,
  );

  it('widens one scene to every scene of its song, reprise included', () => {
    expect(scenesOfSongs(SET, [1])).toEqual([0, 1, 3]);
  });

  it('unions the songs when the selection spans more than one', () => {
    expect(scenesOfSongs(SET, [1, 2])).toEqual([0, 1, 2, 3]);
  });

  it('passes an unmapped scene through rather than dropping it', () => {
    // Nothing to widen to, and widening to nothing would make the write a
    // silent no-op on exactly the scenes a mapping pass hasn’t reached.
    const d = derive([scene(0, '')], compilePattern('[{role}] {song}')!);
    expect(d.unmapped).toEqual([0]);
    expect(scenesOfSongs(d, [0])).toEqual([0]);
  });

  it('is empty for an empty selection', () => {
    expect(scenesOfSongs(SET, [])).toEqual([]);
  });

  it('names the songs a selection touches, in set order', () => {
    expect(songsOfScenes(SET, [2, 1]).map((s) => s.name)).toEqual([
      'Nightfall',
      'Glass Tunnel',
    ]);
  });
});

describe('disagreements', () => {
  it('reports a song whose scenes do not agree on a fact', () => {
    const d = derive(
      [
        scene(0, 'Nightfall 128 Bm [intro]'),
        scene(1, 'Nightfall 130 Bm [verse]'),
        scene(2, 'Nightfall 128 Am [chorus]'),
      ],
      PATTERN,
    );
    expect(d.songs[0]!.observed.bpm).toEqual(['128', '130']);
    expect(disagreements(d)).toEqual([
      { song: 'Nightfall', field: 'bpm', values: ['128', '130'] },
      { song: 'Nightfall', field: 'key', values: ['Bm', 'Am'] },
    ]);
  });

  it('reports a scene tempo that disagrees with its neighbours', () => {
    const d = derive(
      [scene(0, 'Nightfall [intro]', 128), scene(1, 'Nightfall [verse]', 130)],
      PATTERN,
    );
    expect(disagreements(d)).toEqual([
      { song: 'Nightfall', field: 'tempo', values: ['128', '130'] },
    ]);
  });

  it('reports song tags that disagree across scenes', () => {
    const current = compilePattern(DEFAULT_SCENE_PATTERN)!;
    const d = derive(
      [
        scene(0, '[INTRO] @Bm NIGHTFALL {COVER}'),
        scene(1, '[VERSE] @Bm NIGHTFALL {ORIGINAL}'),
      ],
      current,
    );
    expect(d.scenes[0]).toMatchObject({ song: 'NIGHTFALL', tag: 'COVER' });
    expect(d.songs[0]!.observed.tag).toEqual(['COVER', 'ORIGINAL']);
    expect(disagreements(d)).toContainEqual({
      song: 'NIGHTFALL',
      field: 'tag',
      values: ['COVER', 'ORIGINAL'],
    });
  });

  it('normalizes an open-vocabulary song tag to uppercase', () => {
    const current = compilePattern(DEFAULT_SCENE_PATTERN)!;
    const d = derive([scene(0, '[INTRO] NIGHTFALL {late night}')], current);
    expect(d.scenes[0]!.tag).toBe('LATE NIGHT');
    expect(d.songs[0]!.observed.tag).toEqual(['LATE NIGHT']);
  });

  it('is empty when every song is internally consistent', () => {
    const d = derive(
      [scene(0, 'Nightfall 128 Bm [intro]'), scene(1, 'Nightfall 128 Bm [verse]')],
      PATTERN,
    );
    expect(disagreements(d)).toEqual([]);
  });

  it('does not count a scene that simply omits a field as a disagreement', () => {
    // One scene naming the key and another leaving it out is incomplete, not
    // contradictory — flagging it would bury the real conflicts.
    const d = derive(
      [scene(0, 'Nightfall 128 Bm [intro]'), scene(1, 'Nightfall 128 [verse]')],
      PATTERN,
    );
    expect(disagreements(d)).toEqual([]);
  });
});

describe('songByScene', () => {
  it('maps every mapped scene to its song, and omits the rest', () => {
    const strict = compilePattern('{song} {bpm} {key}')!;
    const d = derive([scene(0, 'Nightfall 128 Bm'), scene(1, 'Audio 3')], strict);
    const by = songByScene(d);
    expect(by.get(0)!.name).toBe('Nightfall');
    expect(by.has(1)).toBe(false);
  });
});

describe('reading more than one convention', () => {
  // The migration path. A set is normally *half* converted — some scenes
  // renamed into the current convention, the rest still on the old one — and
  // both have to land in the same song or the grid falls apart mid-pass.
  const CURRENT = compilePattern(DEFAULT_SCENE_PATTERN)!;
  const LEADING_TAG = compilePattern(LEADING_TAG_SCENE_PATTERN)!;
  const WITH_BPM = compilePattern(BPM_SCENE_PATTERN)!;
  const LEGACY = compilePattern(LEGACY_SCENE_PATTERN)!;
  const ALL = [CURRENT, LEADING_TAG, WITH_BPM, LEGACY];

  it('accepts a single pattern or a list, so existing callers are unaffected', () => {
    const one = derive([scene(0, 'Nightfall 128 Bm [verse]')], LEGACY);
    const many = derive([scene(0, 'Nightfall 128 Bm [verse]')], [LEGACY]);
    expect(one).toEqual(many);
  });

  it('reads each scene with whichever pattern gets the most out of it', () => {
    // Every scene pattern is *total* — `{song}` is free and the rest optional,
    // so each one matches every name by swallowing it whole. Picking the first
    // match would mean never consulting the migration patterns at all.
    const d = derive(
      [
        scene(0, '[INTRO] {COVER} @Bm NIGHTFALL'),
        scene(1, '[BUILD] @128-Bm NIGHTFALL'),
        scene(2, 'Nightfall 128 Bm [verse]'),
      ],
      ALL,
    );
    expect(d.scenes[0]).toMatchObject({ song: 'NIGHTFALL', tag: 'COVER', role: 'INTRO' });
    expect(d.scenes[0]!.fields).toMatchObject({ tag: 'COVER', key: 'Bm' });
    expect(d.scenes[1]).toMatchObject({ song: 'NIGHTFALL', role: 'BUILD' });
    expect(d.scenes[1]!.fields).toMatchObject({ bpm: '128', key: 'Bm' });
    expect(d.scenes[2]).toMatchObject({ song: 'Nightfall', role: 'verse' });
    expect(d.scenes[2]!.fields).toMatchObject({ bpm: '128', key: 'Bm' });
  });

  it('collects a half-converted song into one entry, not two', () => {
    // Song identity folds case, which is what makes NIGHTFALL and Nightfall the
    // same song across the convention change rather than a split library.
    const d = derive(
      [
        scene(0, '[INTRO] @Bm NIGHTFALL'),
        scene(1, '[VERSE] @128-Bm NIGHTFALL'),
        scene(2, 'Nightfall 128 Bm [chorus]'),
      ],
      ALL,
    );
    expect(d.songs).toHaveLength(1);
    expect(d.songs[0]!.scenes).toEqual([0, 1, 2]);
    expect(d.songs[0]!.blocks).toEqual([{ from: 0, to: 2 }]);
    // And the facts agree, so nothing shows as drift just for being mid-migration.
    expect(d.songs[0]!.observed.bpm).toEqual(['128']);
    expect(d.songs[0]!.observed.key).toEqual(['Bm']);
  });

  it('breaks a tie toward the earlier pattern', () => {
    const d = derive([scene(0, 'Audio 5')], ALL);
    expect(d.scenes[0]!.song).toBe('Audio 5');
    expect(d.unmapped).toEqual([]);
  });
});
