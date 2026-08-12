import { describe, expect, it } from 'vitest';
import {
  commonTitle,
  formatTitle,
  isBpm,
  isKey,
  isTag,
  parseTitle,
  patchTitle,
  splitsAsArtist,
  titleOf,
  titleOps,
} from './sceneTitle.js';
import { compilePattern, DEFAULT_SCENE_PATTERN } from './namePattern.js';
import type { SceneFields } from './roles.js';

describe('parseTitle', () => {
  it('splits the full convention', () => {
    expect(parseTitle('Nightfall 128 Bm')).toEqual({
      song: 'Nightfall',
      artist: '',
      tag: '',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('keeps a multi-word song together', () => {
    expect(parseTitle('Glass Tunnel 124 F#m')).toEqual({
      song: 'Glass Tunnel',
      artist: '',
      tag: '',
      bpm: '124',
      key: 'F#m',
    });
  });

  it('reads a bpm with no key', () => {
    expect(parseTitle('Nightfall 128')).toEqual({ song: 'Nightfall', artist: '', tag: '', bpm: '128', key: '' });
  });

  it('reads a key with no bpm', () => {
    expect(parseTitle('Nightfall Bm')).toEqual({ song: 'Nightfall', artist: '', tag: '', bpm: '', key: 'Bm' });
  });

  it('reads bpm and key with no song', () => {
    expect(parseTitle('128 Bm')).toEqual({ song: '', artist: '', tag: '', bpm: '128', key: 'Bm' });
  });

  it('leaves a title that follows no convention entirely in song', () => {
    expect(parseTitle('Arp Jam 2')).toEqual({ song: 'Arp Jam 2', artist: '', tag: '', bpm: '', key: '' });
    expect(parseTitle('Audio 3')).toEqual({ song: 'Audio 3', artist: '', tag: '', bpm: '', key: '' });
  });

  it('only takes bpm and key off the end, never from the middle', () => {
    expect(parseTitle('Nightfall Bm 128')).toEqual({
      song: 'Nightfall Bm',
      artist: '',
      tag: '',
      bpm: '128',
      key: '',
    });
  });

  it('handles an empty title', () => {
    expect(parseTitle('')).toEqual({ song: '', artist: '', tag: '', bpm: '', key: '' });
    expect(parseTitle('   ')).toEqual({ song: '', artist: '', tag: '', bpm: '', key: '' });
  });
});

describe('parseTitle — the artist', () => {
  it('splits the song from who plays it', () => {
    expect(parseTitle('@Bm NIGHTFALL - THE AVIATORS {COVER}')).toEqual({
      song: 'NIGHTFALL',
      artist: 'THE AVIATORS',
      tag: 'COVER',
      bpm: '',
      key: 'Bm',
    });
  });

  it('splits at the first separator, like the compiled pattern does', () => {
    // Both parsers have to answer the same thing or the grid shows one song and
    // a rename writes another. `namePattern`'s {song} is lazy; this is that.
    expect(parseTitle('ALPHA - BETA - GAMMA').song).toBe('ALPHA');
    expect(parseTitle('ALPHA - BETA - GAMMA').artist).toBe('BETA - GAMMA');
  });

  it('needs the spaces — a hyphenated title stays whole', () => {
    expect(parseTitle('TWENTY-ONE')).toEqual({
      song: 'TWENTY-ONE',
      artist: '',
      tag: '',
      bpm: '',
      key: '',
    });
  });

  it('keeps a half-written separator in the song rather than tearing it', () => {
    expect(parseTitle('NIGHTFALL - ').song).toBe('NIGHTFALL -');
    expect(parseTitle('- THE AVIATORS').song).toBe('- THE AVIATORS');
    expect(parseTitle('- THE AVIATORS').artist).toBe('');
  });

  it('reads an artist off an older name too, after its trailing facts', () => {
    expect(parseTitle('Nightfall - The Aviators 128 Bm')).toEqual({
      song: 'Nightfall',
      artist: 'The Aviators',
      tag: '',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('agrees with the compiled pattern on every shape', () => {
    // The two parsers are independent implementations of one convention, and
    // this is the only thing holding them together. `titleOf` strips the role,
    // so the role token is left off both sides.
    //
    // Names ending in a key-shaped word are left out on purpose: this parser
    // also reads the legacy trailing `128 Bm`, so it takes the `C` off
    // "ALPHA - BETA - C" where the current pattern doesn't. That's the
    // migration path doing its job, not the two disagreeing about an artist —
    // derivation compiles the legacy pattern too and picks the richer read.
    const compiled = compilePattern(DEFAULT_SCENE_PATTERN)!;
    for (const name of [
      '@Bm NIGHTFALL - THE AVIATORS {COVER}',
      '@Bm NIGHTFALL - THE AVIATORS',
      'NIGHTFALL - THE AVIATORS {COVER}',
      'NIGHTFALL - THE AVIATORS',
      'NIGHTFALL {COVER}',
      'NIGHTFALL',
      'ALPHA - BETA - GAMMA',
      'TWENTY-ONE',
      'GLASS TUNNEL - SUN & STEEL',
    ]) {
      const hand = parseTitle(name);
      const read = compiled.parse(name) ?? {};
      expect({ song: read.song ?? '', artist: read.artist ?? '' }, name).toEqual({
        song: hand.song,
        artist: hand.artist,
      });
    }
  });
});

describe('splitsAsArtist', () => {
  it('is what the editors ask before writing a song name', () => {
    expect(splitsAsArtist('SUNDAY - BLOODY SUNDAY')).toBe(true);
    expect(splitsAsArtist('TWENTY-ONE')).toBe(false);
    expect(splitsAsArtist('NIGHTFALL')).toBe(false);
  });
});

describe('parse/format round-trip', () => {
  // The property the whole module leans on: a title this can't decompose comes
  // back rearranged by nothing but its case. Without it, running a patch over a
  // name nobody meant to restructure would quietly restructure it.
  const titles = [
    '@Bm NIGHTFALL',
    '@Bm NIGHTFALL {COVER}',
    '@Bm NIGHTFALL - THE AVIATORS',
    '@Bm NIGHTFALL - THE AVIATORS {COVER}',
    'GLASS TUNNEL - SUN & STEEL',
    'TWENTY-ONE',
    'GLASS TUNNEL {ORIGINAL}',
    'NIGHTFALL {JAM}',
    'GLASS TUNNEL {LATE NIGHT}',
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
    ['{COVER} @Bm NIGHTFALL', '@Bm NIGHTFALL {COVER}'],
    ['{ORIGINAL} GLASS TUNNEL', 'GLASS TUNNEL {ORIGINAL}'],
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
  it('writes tag, key and song, never bpm', () => {
    expect(formatTitle({ song: 'Nightfall', artist: '', tag: 'COVER', bpm: '', key: 'Bm' })).toBe(
      '@Bm NIGHTFALL {COVER}',
    );
    expect(formatTitle({ song: 'Nightfall', artist: '', tag: '', bpm: '128', key: '' })).toBe('NIGHTFALL');
    expect(formatTitle({ song: 'Nightfall', artist: '', tag: '', bpm: '128', key: 'Bm' })).toBe('@Bm NIGHTFALL');
    expect(formatTitle({ song: 'Nightfall', artist: '', tag: '', bpm: '', key: '' })).toBe('NIGHTFALL');
    expect(formatTitle({ song: '', artist: '', tag: '', bpm: '', key: '' })).toBe('');
  });

  it('writes the artist behind the song, in caps like it', () => {
    expect(
      formatTitle({ song: 'Nightfall', artist: 'The Aviators', tag: 'COVER', bpm: '', key: 'Bm' }),
    ).toBe('@Bm NIGHTFALL - THE AVIATORS {COVER}');
  });

  it('drops an artist with no song rather than writing a name it would misread', () => {
    // " - THE AVIATORS" comes back as a song called that, so the half the
    // convention can't express goes instead of the round trip.
    expect(formatTitle({ song: '', artist: 'The Aviators', tag: '', bpm: '', key: 'Bm' })).toBe(
      '@Bm',
    );
  });
});

describe('isBpm / isKey / isTag', () => {
  it('accepts what the convention uses', () => {
    for (const s of ['92', '128', '174']) expect(isBpm(s), s).toBe(true);
    for (const s of ['Bm', 'F#m', 'Eb', 'A', 'G#']) expect(isKey(s), s).toBe(true);
    for (const s of ['COVER', 'ORIGINAL', 'JAM', 'REMIX', 'late night']) {
      expect(isTag(s), s).toBe(true);
    }
  });

  it('rejects what would misparse', () => {
    for (const s of ['2', '1288', 'x', '']) expect(isBpm(s), s).toBe(false);
    // Lower-case is rejected so a flat `b` can't be confused with the note B.
    for (const s of ['bm', 'H', 'Bmaj', '']) expect(isKey(s), s).toBe(false);
    for (const s of ['BAD_TAG', '{JAM}', 'JAM!', '']) expect(isTag(s), s).toBe(false);
  });
});

describe('patchTitle', () => {
  const t = { song: 'Nightfall', artist: '', tag: 'COVER', bpm: '128', key: 'Bm' };

  it('leaves an omitted field alone', () => {
    expect(patchTitle(t, { bpm: '92' })).toEqual({ song: 'Nightfall', artist: '', tag: 'COVER', bpm: '92', key: 'Bm' });
  });

  it('clears a field set to empty — not the same as omitting it', () => {
    expect(patchTitle(t, { key: '' })).toEqual({ song: 'Nightfall', artist: '', tag: 'COVER', bpm: '128', key: '' });

    expect(patchTitle(t, { tag: 'original' })).toEqual({
      song: 'Nightfall',
      artist: '',
      tag: 'ORIGINAL',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('is a no-op for an empty patch', () => {
    expect(patchTitle(t, {})).toEqual(t);
  });
});

describe('commonTitle', () => {
  it('reports the shared value per field and null where they differ', () => {
    expect(
      commonTitle([
        { song: 'Nightfall', artist: '', tag: 'COVER', bpm: '128', key: 'Bm' },
        { song: 'Daybreak', artist: '', tag: 'ORIGINAL', bpm: '128', key: 'Bm' },
      ]),
    ).toEqual({ song: null, artist: '', tag: null, bpm: '128', key: 'Bm' });
  });

  it('agrees with itself for one title', () => {
    expect(commonTitle([{ song: 'Nightfall', artist: '', tag: 'COVER', bpm: '128', key: 'Bm' }])).toEqual({
      song: 'Nightfall',
      artist: '',
      tag: 'COVER',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('is all null for nothing selected', () => {
    expect(commonTitle([])).toEqual({ song: null, artist: null, tag: null, bpm: null, key: null });
  });

  it('treats a shared empty part as agreement, not as mixed', () => {
    expect(
      commonTitle([
        { song: 'A', artist: '', tag: '', bpm: '', key: '' },
        { song: 'B', artist: '', tag: '', bpm: '', key: '' },
      ]).bpm,
    ).toBe('');
  });
});

describe('titleOf', () => {
  it('reads the title out from under the role tag', () => {
    expect(titleOf('Nightfall 128 Bm [chorus]')).toEqual({
      song: 'Nightfall',
      artist: '',
      tag: '',
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
  it('preserves a song tag while changing another title field', () => {
    const tagged = [{ ...BEFORE[0]!, name: '[INTRO] {COVER} @Bm NIGHTFALL' }];
    expect(titleOps(tagged, [0], { key: 'Am' })).toEqual([
      { s: 0, name: '[INTRO] @Am NIGHTFALL {COVER}' },
    ]);
  });

  it('adds and clears a song tag', () => {
    expect(titleOps(BEFORE, [0], { tag: 'ORIGINAL' })).toEqual([
      { s: 0, name: '[INTRO] @Bm NIGHTFALL {ORIGINAL}' },
    ]);
    const tagged = [{ ...BEFORE[0]!, name: '[INTRO] {COVER} @Bm NIGHTFALL' }];
    expect(titleOps(tagged, [0], { tag: '' })).toEqual([
      { s: 0, name: '[INTRO] @Bm NIGHTFALL' },
    ]);
  });

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
