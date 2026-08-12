import { MIN_TEMPO, songKey } from './derive.js';
import {
  ARTIST_SEPARATOR,
  formatTitle,
  isBpm,
  isKey,
  splitsAsArtist,
} from './sceneTitle.js';

/** The intentionally opinionated size of a newly scaffolded song. */
export const NEW_SONG_SCENES = 8;

export interface NewSongDraft {
  at: number;
  name: string;
  /** Optional, and written after the name behind `" - "`. */
  artist: string;
  key: string;
  bpm: string;
  colorIndex: number | null;
}

export type NewSongField = 'at' | 'name' | 'artist' | 'key' | 'bpm' | 'color';

export interface NewSongProblem {
  field: NewSongField;
  message: string;
}

export function newSongProblems(
  draft: NewSongDraft,
  sceneCount: number,
  palette: readonly number[],
  existingSongs: readonly string[],
): NewSongProblem[] {
  const out: NewSongProblem[] = [];
  const name = draft.name.trim();
  if (!Number.isInteger(draft.at) || draft.at < 0 || draft.at > sceneCount) {
    out.push({ field: 'at', message: 'Choose a valid insertion point.' });
  }
  if (!name) out.push({ field: 'name', message: 'Name the song.' });
  else if (splitsAsArtist(name)) {
    // The name would be read back as a song and an artist, so the song this
    // scaffolds is not the one that was typed. Caught here rather than after
    // eight scenes carry it.
    out.push({
      field: 'name',
      message: `"${ARTIST_SEPARATOR.trim()}" separates the artist — put that half in Artist.`,
    });
  } else if (existingSongs.some((song) => songKey(song) === songKey(name))) {
    out.push({ field: 'name', message: 'That song already exists in this set.' });
  }
  if (draft.key.trim() !== '' && !isKey(draft.key)) {
    out.push({ field: 'key', message: 'Key is like Bm, F#m or Eb.' });
  }
  const bpm = draft.bpm.trim();
  if (bpm !== '' && (!isBpm(bpm) || Number(bpm) < MIN_TEMPO)) {
    out.push({ field: 'bpm', message: 'BPM must be 20–999.' });
  }
  if (
    draft.colorIndex !== null &&
    (!Number.isInteger(draft.colorIndex) || palette[draft.colorIndex] === undefined)
  ) {
    out.push({ field: 'color', message: 'Choose a color from the palette.' });
  }
  return out;
}

/** A validated draft in the additive bridge protocol's shape. */
export function planNewSong(
  draft: NewSongDraft,
  sceneCount: number,
  palette: readonly number[],
  existingSongs: readonly string[],
): BSV.SceneAddition | null {
  if (newSongProblems(draft, sceneCount, palette, existingSongs).length > 0) return null;
  const addition: BSV.SceneAddition = {
    at: draft.at,
    count: NEW_SONG_SCENES,
    // BPM belongs to Scene.tempo and therefore stays out of the durable name.
    name: formatTitle({
      song: draft.name,
      artist: draft.artist,
      key: draft.key,
      bpm: '',
      tag: '',
    }),
  };
  if (draft.colorIndex !== null) addition.color = palette[draft.colorIndex]!;
  if (draft.bpm.trim() !== '') addition.tempo = Number(draft.bpm);
  return addition;
}
