import { describe, expect, it } from 'vitest';
import {
  NEW_SONG_SCENES,
  newSongProblems,
  planNewSong,
  type NewSongDraft,
} from './newSong.js';

const PALETTE = [0x112233, 0xaabbcc];
const BASE: NewSongDraft = { at: 12, name: 'Nightfall', key: '', bpm: '', colorIndex: null };

describe('planNewSong', () => {
  it('builds eight identically named, otherwise blank scenes', () => {
    expect(planNewSong(BASE, 12, PALETTE, [])).toEqual({
      at: 12,
      count: NEW_SONG_SCENES,
      name: 'NIGHTFALL',
    });
  });

  it('puts key in the name and color/tempo in scene properties', () => {
    expect(
      planNewSong({ ...BASE, key: 'F#m', bpm: '128', colorIndex: 1 }, 20, PALETTE, []),
    ).toEqual({
      at: 12,
      count: 8,
      name: '@F#m NIGHTFALL',
      color: 0xaabbcc,
      tempo: 128,
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
