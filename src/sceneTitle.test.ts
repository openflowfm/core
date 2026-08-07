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
  // back rearranged by nothing but its case. Without it, running a patch over a
  // name nobody meant to restructure would quietly restructure it.
  const titles = [
    '@Bm NIGHTFALL',
    '@F#m GLASS TUNNEL',
    '@Bm',
    'ARP JAM 2',
    'AUDIO 3',
    '',
  ];

  for (const t of titles) {
    it(`round-trips ${JSON.stringify(t)}`, () => {
      expect(formatTitle(parseTitle(t))).toBe(t);
    });
  }

  // Older conventions don't round-trip, and mustn't: BPM moves out of the name
  // to Scene.tempo while key, role and song survive the conversion.
  const converts: Array<[string, string]> = [
    ['@128-Bm NIGHTFALL', '@Bm NIGHTFALL'],
    ['@124-F#m GLASS TUNNEL', '@F#m GLASS TUNNEL'],
    ['@128 NIGHTFALL', 'NIGHTFALL'],
    ['Nightfall 128 Bm', '@Bm NIGHTFALL'],
    ['Glass Tunnel 124 F#m', '@F#m GLASS TUNNEL'],
    ['Nightfall 128', 'NIGHTFALL'],
    ['Nightfall Bm', '@Bm NIGHTFALL'],
  ];
  for (const [old, next] of converts) {
    it(`converts ${JSON.stringify(old)} to ${JSON.stringify(next)}`, () => {
      expect(formatTitle(parseTitle(old))).toBe(next);
      // And converting is idempotent — running it twice can't keep changing it.
      expect(formatTitle(parseTitle(next))).toBe(next);
    });
  }

  it('leaves a title that followed neither convention alone but for its case', () => {
    expect(formatTitle(parseTitle('Arp Jam 2'))).toBe('ARP JAM 2');
    // "Em" is only a key after an @; here it's the first word of a title.
    expect(formatTitle(parseTitle('Em Dash'))).toBe('EM DASH');
  });
});

describe('formatTitle', () => {
  it('writes key and song, never bpm', () => {
    expect(formatTitle({ song: 'Nightfall', bpm: '', key: 'Bm' })).toBe('@Bm NIGHTFALL');
    expect(formatTitle({ song: 'Nightfall', bpm: '128', key: '' })).toBe('NIGHTFALL');
    expect(formatTitle({ song: 'Nightfall', bpm: '128', key: 'Bm' })).toBe('@Bm NIGHTFALL');
    expect(formatTitle({ song: 'Nightfall', bpm: '', key: '' })).toBe('NIGHTFALL');
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
  { s: 0, name: '[INTRO] @128-Bm NIGHTFALL', colorIndex: -1, color: 0, tempo: -1 },
  { s: 1, name: '[VERSE] @128-Bm NIGHTFALL', colorIndex: 14, color: 0xff3636, tempo: -1 },
  { s: 2, name: '[CHORUS] @92-F#m DAYBREAK', colorIndex: 3, color: 0xf7f47c, tempo: -1 },
  { s: 3, name: 'UNTAGGED SCENE', colorIndex: -1, color: 0, tempo: -1 },
];

/** A set still on the old convention — what an existing `.als` looks like. */
const LEGACY: SceneFields[] = [
  { s: 0, name: 'Nightfall 128 Bm [intro]', colorIndex: -1, color: 0, tempo: -1 },
  { s: 1, name: 'Daybreak 92 F#m [chorus]', colorIndex: 3, color: 0xf7f47c, tempo: -1 },
];

describe('titleOps', () => {
  it('rewrites the song and keeps each scene its own role', () => {
    expect(titleOps(BEFORE, [0, 1], { song: 'Moonrise' })).toEqual([
      { s: 0, name: '[INTRO] @Bm MOONRISE' },
      { s: 1, name: '[VERSE] @Bm MOONRISE' },
    ]);
  });

  it('sets one field across scenes that disagree on the others', () => {
    // The case an omitted field exists for: two songs, one shared key.
    expect(titleOps(BEFORE, [0, 2], { key: 'Am' })).toEqual([
      { s: 0, name: '[INTRO] @Am NIGHTFALL' },
      { s: 2, name: '[CHORUS] @Am DAYBREAK' },
    ]);
  });

  it('never writes bpm into the name', () => {
    expect(titleOps(BEFORE, [1], { bpm: '' })).toEqual([
      { s: 1, name: '[VERSE] @Bm NIGHTFALL' },
    ]);
  });

  it('strips bpm from every older name even when the bpm patch matches', () => {
    expect(titleOps(BEFORE, [0, 1, 2], { bpm: '128' })).toEqual([
      { s: 0, name: '[INTRO] @Bm NIGHTFALL' },
      { s: 1, name: '[VERSE] @Bm NIGHTFALL' },
      { s: 2, name: '[CHORUS] @F#m DAYBREAK' },
    ]);
  });

  it('is empty for a patch that changes nothing anywhere', () => {
    const current = BEFORE.map((scene) => ({
      ...scene,
      name: formatTitle(titleOf(scene.name)),
    }));
    expect(titleOps(current, [0, 1], {})).toEqual([]);
  });

  it('works on a scene with no role tag', () => {
    expect(titleOps(BEFORE, [3], { song: 'Moonrise' })).toEqual([
      { s: 3, name: 'MOONRISE' },
    ]);
  });

  it('adds key but not bpm to a scene that had neither', () => {
    expect(titleOps(BEFORE, [3], { bpm: '128', key: 'Bm' })).toEqual([
      { s: 3, name: '@Bm UNTAGGED SCENE' },
    ]);
  });

  it('converts an old-convention set as a side effect of any rename', () => {
    // This is the migration path, and it's why parseTitle still reads trailing
    // facts: key and role survive, while bpm moves to Scene.tempo.
    expect(titleOps(LEGACY, [0, 1], { key: 'Am' })).toEqual([
      { s: 0, name: '[INTRO] @Am NIGHTFALL' },
      { s: 1, name: '[CHORUS] @Am DAYBREAK' },
    ]);
  });

  it('converts an old-convention scene even when the patch is empty', () => {
    // A no-op patch is not a no-op rename here, and that's deliberate: it's the
    // one gesture that moves a scene onto the new convention without also
    // changing what it says.
    expect(titleOps(LEGACY, [0], {})).toEqual([
      { s: 0, name: '[INTRO] @Bm NIGHTFALL' },
    ]);
  });

  it('skips scenes it has no "before" for', () => {
    expect(titleOps(BEFORE, [99], { song: 'Moonrise' })).toEqual([]);
  });
});
