import { describe, expect, it } from 'vitest';
import {
  orderScenes,
  sortSongOrder,
  type OrderedScene,
  type SortableSong,
} from './songOrder.ts';

/** `'a a b - b'` — one scene per token, `-` for a scene with no song. */
function set(spec: string): OrderedScene[] {
  return spec
    .split(' ')
    .filter(Boolean)
    .map((token, s) => ({ s, songKey: token === '-' ? null : token }));
}

describe('orderScenes', () => {
  it('leaves a set that is already in that order alone', () => {
    const { order } = orderScenes(set('a a b b c'), ['a', 'b', 'c']);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts the songs in the order given, scenes and all', () => {
    const { order } = orderScenes(set('a a b b b c'), ['c', 'a', 'b']);
    expect(order).toEqual([5, 0, 1, 2, 3, 4]);
  });

  it('gathers a song found in two runs', () => {
    // The set list says a song once, so applying one has to collect it. That's
    // a real change — the reprise stops being one — and the whole reason the
    // modal says how many runs a song has before it writes.
    const { order, placements } = orderScenes(set('a a b b a'), ['a', 'b']);
    expect(order).toEqual([0, 1, 4, 2, 3]);
    expect(placements[0]!.scenes).toEqual([0, 1, 4]);
  });

  it('takes unmapped scenes along with the song they sit after', () => {
    // They aren't in the running order and can't be placed by it. Pinning them
    // to the index they hold now would cut a song in half as soon as the songs
    // above it changed length.
    const { order, placements } = orderScenes(set('a a - b b'), ['b', 'a']);
    expect(order).toEqual([3, 4, 0, 1, 2]);
    expect(placements[1]!.trailing).toEqual([2]);
  });

  it('collects several trailing runs onto one song', () => {
    const { placements } = orderScenes(set('a - a - -'), ['a']);
    expect(placements[0]!.scenes).toEqual([0, 2]);
    expect(placements[0]!.trailing).toEqual([1, 3, 4]);
  });

  it('keeps unmapped scenes above the first song at the top', () => {
    // The one run with no song to follow. The top of the set is where it was
    // and where it stays.
    const { order, head } = orderScenes(set('- - a a b'), ['b', 'a']);
    expect(head).toEqual([0, 1]);
    expect(order).toEqual([0, 1, 4, 2, 3]);
  });

  it('is the identity when the set is nothing but unmapped scenes', () => {
    const { order, placements } = orderScenes(set('- - -'), []);
    expect(order).toEqual([0, 1, 2]);
    expect(placements).toEqual([]);
  });

  it('appends a song the running order forgot, rather than dropping it', () => {
    // A stale draft against a fresh snapshot still has to describe every scene:
    // `planSceneReorder` refuses a partial order, and refusing is not a useful
    // answer to give someone who has just pressed Apply.
    const { order } = orderScenes(set('a b c'), ['c']);
    expect(order).toEqual([2, 0, 1]);
  });

  it('ignores a song in the running order that the set no longer carries', () => {
    const { order, placements } = orderScenes(set('a b'), ['gone', 'b', 'a']);
    expect(placements.map((p) => p.songKey)).toEqual(['b', 'a']);
    expect(order).toEqual([1, 0]);
  });

  it('ignores a song listed twice', () => {
    const { order } = orderScenes(set('a b'), ['b', 'b', 'a']);
    expect(order).toEqual([1, 0]);
  });

  it('always returns every scene exactly once', () => {
    // Whatever the caller passes. This is what `planSceneReorder` is going to
    // insist on, and the failure it would otherwise throw lands mid-render.
    const scenes = set('a - b b - c a -');
    for (const listed of [[], ['c'], ['c', 'a', 'b'], ['b', 'gone', 'a', 'c'], ['a', 'a']]) {
      const { order } = orderScenes(scenes, listed);
      expect([...order].sort((a, b) => a - b)).toEqual(scenes.map((sc) => sc.s));
    }
  });
});

const songs: SortableSong[] = [
  { songKey: 'zulu', name: 'Zulu', tag: 'ORIGINAL', key: 'Am', bpm: '128' },
  { songKey: 'alpha', name: 'Alpha', tag: 'COVER', key: 'Bm', bpm: '120' },
  { songKey: 'bravo', name: 'Bravo', tag: 'COVER', key: 'Am', bpm: '124' },
  { songKey: 'charlie', name: 'Charlie', tag: 'COVER', key: 'Am', bpm: '118' },
  { songKey: 'untagged', name: 'Untagged', tag: '', key: '', bpm: '' },
];

describe('sortSongOrder', () => {
  it('sorts by one field in either direction', () => {
    expect(sortSongOrder(songs, [{ field: 'name', direction: 'asc' }])).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'untagged',
      'zulu',
    ]);
    expect(sortSongOrder(songs, [{ field: 'bpm', direction: 'desc' }])).toEqual([
      'zulu',
      'bravo',
      'alpha',
      'charlie',
      'untagged',
    ]);
  });

  it('uses each level only to break ties in the levels above it', () => {
    expect(
      sortSongOrder(songs, [
        { field: 'tag', direction: 'asc' },
        { field: 'key', direction: 'asc' },
        { field: 'bpm', direction: 'desc' },
        { field: 'name', direction: 'asc' },
      ]),
    ).toEqual(['bravo', 'charlie', 'alpha', 'zulu', 'untagged']);
  });

  it('keeps missing metadata last in both directions', () => {
    expect(sortSongOrder(songs, [{ field: 'tag', direction: 'asc' }]).at(-1)).toBe(
      'untagged',
    );
    expect(sortSongOrder(songs, [{ field: 'tag', direction: 'desc' }]).at(-1)).toBe(
      'untagged',
    );
  });

  it('preserves set order when the hierarchy leaves songs tied', () => {
    expect(sortSongOrder(songs, [])).toEqual(songs.map((song) => song.songKey));
    expect(sortSongOrder(songs, [{ field: 'tag', direction: 'asc' }]).slice(0, 3)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('compares numeric bpm values numerically, not lexically', () => {
    const tempos: SortableSong[] = [
      { songKey: 'fast', name: 'Fast', tag: '', key: '', bpm: '100' },
      { songKey: 'slow', name: 'Slow', tag: '', key: '', bpm: '92' },
    ];
    expect(sortSongOrder(tempos, [{ field: 'bpm', direction: 'asc' }])).toEqual([
      'slow',
      'fast',
    ]);
  });
});
