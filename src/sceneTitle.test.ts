import { describe, expect, it } from 'vitest';
import {
  commonTitle,
  formatTitle,
  isBpm,
  isKey,
  parseTitle,
  patchTitle,
  titleOf,
  titleOps,
} from './sceneTitle.js';
import type { SceneFields } from './roles.js';

describe('parseTitle', () => {
  it('splits the full convention', () => {
    expect(parseTitle('Nightfall 128 Bm')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('keeps a multi-word song together', () => {
    expect(parseTitle('Glass Tunnel 124 F#m')).toEqual({
      song: 'Glass Tunnel',
      bpm: '124',
      key: 'F#m',
    });
  });

  it('reads a bpm with no key', () => {
    expect(parseTitle('Nightfall 128')).toEqual({ song: 'Nightfall', bpm: '128', key: '' });
  });

  it('reads a key with no bpm', () => {
    expect(parseTitle('Nightfall Bm')).toEqual({ song: 'Nightfall', bpm: '', key: 'Bm' });
  });

  it('reads bpm and key with no song', () => {
    expect(parseTitle('128 Bm')).toEqual({ song: '', bpm: '128', key: 'Bm' });
  });

  it('leaves a title that follows no convention entirely in song', () => {
    expect(parseTitle('Arp Jam 2')).toEqual({ song: 'Arp Jam 2', bpm: '', key: '' });
    expect(parseTitle('Audio 3')).toEqual({ song: 'Audio 3', bpm: '', key: '' });
  });

  it('only takes bpm and key off the end, never from the middle', () => {
    expect(parseTitle('Nightfall Bm 128')).toEqual({
      song: 'Nightfall Bm',
      bpm: '128',
      key: '',
    });
  });

  it('handles an empty title', () => {
    expect(parseTitle('')).toEqual({ song: '', bpm: '', key: '' });
    expect(parseTitle('   ')).toEqual({ song: '', bpm: '', key: '' });
  });
});

describe('parse/format round-trip', () => {
  // The property the whole module leans on: a title this can't decompose comes
  // back byte-identical rather than rearranged. Without it, running a patch
  // over a name nobody meant to restructure would quietly restructure it.
  const titles = [
    'Nightfall 128 Bm',
    'Glass Tunnel 124 F#m',
    'Nightfall 128',
    'Nightfall Bm',
    '128 Bm',
    'Arp Jam 2',
    'Nightfall Bm 128',
    'Audio 3',
    'Eb',
    '',
  ];

  for (const t of titles) {
    it(`round-trips ${JSON.stringify(t)}`, () => {
      expect(formatTitle(parseTitle(t))).toBe(t);
    });
  }
});

describe('formatTitle', () => {
  it('skips empty parts without leaving double spaces', () => {
    expect(formatTitle({ song: 'Nightfall', bpm: '', key: 'Bm' })).toBe('Nightfall Bm');
    expect(formatTitle({ song: '', bpm: '', key: '' })).toBe('');
  });
});

describe('isBpm / isKey', () => {
  it('accepts what the convention uses', () => {
    for (const s of ['92', '128', '174']) expect(isBpm(s), s).toBe(true);
    for (const s of ['Bm', 'F#m', 'Eb', 'A', 'G#']) expect(isKey(s), s).toBe(true);
  });

  it('rejects what would misparse', () => {
    for (const s of ['2', '1288', 'x', '']) expect(isBpm(s), s).toBe(false);
    // Lower-case is rejected so a flat `b` can't be confused with the note B.
    for (const s of ['bm', 'H', 'Bmaj', '']) expect(isKey(s), s).toBe(false);
  });
});

describe('patchTitle', () => {
  const t = { song: 'Nightfall', bpm: '128', key: 'Bm' };

  it('leaves an omitted field alone', () => {
    expect(patchTitle(t, { bpm: '92' })).toEqual({ song: 'Nightfall', bpm: '92', key: 'Bm' });
  });

  it('clears a field set to empty — not the same as omitting it', () => {
    expect(patchTitle(t, { key: '' })).toEqual({ song: 'Nightfall', bpm: '128', key: '' });
  });

  it('is a no-op for an empty patch', () => {
    expect(patchTitle(t, {})).toEqual(t);
  });
});

describe('commonTitle', () => {
  it('reports the shared value per field and null where they differ', () => {
    expect(
      commonTitle([
        { song: 'Nightfall', bpm: '128', key: 'Bm' },
        { song: 'Daybreak', bpm: '128', key: 'Bm' },
      ]),
    ).toEqual({ song: null, bpm: '128', key: 'Bm' });
  });

  it('agrees with itself for one title', () => {
    expect(commonTitle([{ song: 'Nightfall', bpm: '128', key: 'Bm' }])).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('is all null for nothing selected', () => {
    expect(commonTitle([])).toEqual({ song: null, bpm: null, key: null });
  });

  it('treats a shared empty part as agreement, not as mixed', () => {
    expect(
      commonTitle([
        { song: 'A', bpm: '', key: '' },
        { song: 'B', bpm: '', key: '' },
      ]).bpm,
    ).toBe('');
  });
});

describe('titleOf', () => {
  it('reads the title out from under the role tag', () => {
    expect(titleOf('Nightfall 128 Bm [chorus]')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
    });
  });
});

const BEFORE: SceneFields[] = [
  { s: 0, name: 'Nightfall 128 Bm [intro]', colorIndex: -1, color: 0, tempo: -1 },
  { s: 1, name: 'Nightfall 128 Bm [verse]', colorIndex: 14, color: 0xff3636, tempo: -1 },
  { s: 2, name: 'Daybreak 92 F#m [chorus]', colorIndex: 3, color: 0xf7f47c, tempo: -1 },
  { s: 3, name: 'Untagged scene', colorIndex: -1, color: 0, tempo: -1 },
];

describe('titleOps', () => {
  it('rewrites the song and keeps each scene its own role', () => {
    expect(titleOps(BEFORE, [0, 1], { song: 'Moonrise' })).toEqual([
      { s: 0, name: 'Moonrise 128 Bm [intro]' },
      { s: 1, name: 'Moonrise 128 Bm [verse]' },
    ]);
  });

  it('sets one field across scenes that disagree on the others', () => {
    // The case an omitted field exists for: two songs, one shared key.
    expect(titleOps(BEFORE, [0, 2], { key: 'Am' })).toEqual([
      { s: 0, name: 'Nightfall 128 Am [intro]' },
      { s: 2, name: 'Daybreak 92 Am [chorus]' },
    ]);
  });

  it('clears a part when the patch sets it empty', () => {
    expect(titleOps(BEFORE, [1], { bpm: '' })).toEqual([
      { s: 1, name: 'Nightfall Bm [verse]' },
    ]);
  });

  it('drops scenes the patch would not change', () => {
    expect(titleOps(BEFORE, [0, 1, 2], { bpm: '128' })).toEqual([
      { s: 2, name: 'Daybreak 128 F#m [chorus]' },
    ]);
  });

  it('is empty for a patch that changes nothing anywhere', () => {
    expect(titleOps(BEFORE, [0, 1], {})).toEqual([]);
  });

  it('works on a scene with no role tag', () => {
    expect(titleOps(BEFORE, [3], { song: 'Moonrise' })).toEqual([
      { s: 3, name: 'Moonrise' },
    ]);
  });

  it('adds bpm and key to a scene that had neither', () => {
    expect(titleOps(BEFORE, [3], { bpm: '128', key: 'Bm' })).toEqual([
      { s: 3, name: 'Untagged scene 128 Bm' },
    ]);
  });

  it('skips scenes it has no "before" for', () => {
    expect(titleOps(BEFORE, [99], { song: 'Moonrise' })).toEqual([]);
  });
});
