import { describe, expect, it } from 'vitest';
import {
  NEW_SONG_SCENES,
  newSongProblems,
  planNewSong,
  type NewSongDraft,
} from './newSong.ts';

const PALETTE = [0x112233, 0xaabbcc];
const BASE: NewSongDraft = {
  at: 12,
  name: 'Nightfall',
  artist: '',
  key: '',
  bpm: '',
  colorIndex: null,
};

describe('planNewSong', () => {
  it('builds eight identically named, otherwise blank scenes', () => {
    expect(planNewSong(BASE, 12, PALETTE, [])).toEqual({
      at: 12,
      count: NEW_SONG_SCENES,
      name: 'NIGHTFALL',
    });
  });

  it('puts bpm and key in the name, and only the color on the scenes', () => {
    // No `tempo`: one addition applies one tempo to all eight scenes, which is
    // the every-scene convention this replaced. A new song's bpm is a label
    // until someone projects it onto the song's first scene.
    expect(
      planNewSong({ ...BASE, key: 'F#m', bpm: '128', colorIndex: 1 }, 20, PALETTE, []),
    ).toEqual({
      at: 12,
      count: 8,
      name: '@128-F#m NIGHTFALL',
      color: 0xaabbcc,
    });
  });

  it('writes a bpm with no key without a dangling separator', () => {
    expect(planNewSong({ ...BASE, bpm: '92' }, 12, PALETTE, [])).toEqual({
      at: 12,
      count: NEW_SONG_SCENES,
      name: '@92 NIGHTFALL',
    });
  });

  it('writes the artist into the shared name', () => {
    expect(
      planNewSong({ ...BASE, artist: 'The Aviators', key: 'Bm' }, 12, PALETTE, []),
    ).toEqual({
      at: 12,
      count: NEW_SONG_SCENES,
      name: '@Bm NIGHTFALL - THE AVIATORS',
    });
  });

  it('refuses a name that would read back as a song and an artist', () => {
    // Eight scenes would otherwise carry a song this app then reads as two
    // fields — caught at the field, which is the last point anyone can fix it.
    expect(
      newSongProblems({ ...BASE, name: 'Sunday - Bloody Sunday' }, 20, PALETTE, []),
    ).toContainEqual({
      field: 'name',
      message: '"-" separates the artist — put that half in Artist.',
    });
  });

  it('rejects a duplicate song identity regardless of case and whitespace', () => {
    expect(newSongProblems(BASE, 20, PALETTE, ['  NIGHTFALL '])).toContainEqual({
      field: 'name',
      message: 'That song already exists in this set.',
    });
  });

  it('rejects invalid optional facts', () => {
    const problems = newSongProblems(
      { ...BASE, key: 'H', bpm: '12', colorIndex: 4 },
      20,
      PALETTE,
      [],
    );
    expect(problems.map((p) => p.field)).toEqual(['key', 'bpm', 'color']);
  });

  it('rejects an insertion point outside the set', () => {
    expect(planNewSong({ ...BASE, at: 13 }, 12, PALETTE, [])).toBeNull();
  });
});
