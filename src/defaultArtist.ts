import type { Derivation } from './derive.js';
import { titleOps } from './sceneTitle.js';
import type { SceneFields, SceneWriteOp } from './roles.js';

export interface DefaultArtistConflict {
  song: string;
  artists: string[];
}

/**
 * A safe set-wide fill: only blank artist fields, and never where doing so
 * would make one song disagree with an artist it already names.
 */
export interface DefaultArtistPlan {
  /** Trimmed display form. Name formatting uppercases it at the write edge. */
  artist: string;
  /** Songs that gain the artist, in set order. */
  songs: string[];
  /** Missing scenes left alone because their song names another artist. */
  conflicts: DefaultArtistConflict[];
  ops: SceneWriteOp[];
}

/**
 * Fill missing artist fields without overwriting a fact the set already states.
 *
 * An entirely artistless song is eligible. A partially-filled song is eligible
 * only when its stated artist is already the default; that completes the song
 * instead of creating drift. A different or conflicting stated artist leaves
 * every blank in that song alone and is reported for the preview.
 */
export function planDefaultArtist(
  derivation: Derivation,
  before: readonly SceneFields[],
  defaultArtist: string,
): DefaultArtistPlan {
  const artist = defaultArtist.trim();
  const wanted = artist.toUpperCase();
  const plan: DefaultArtistPlan = { artist, songs: [], conflicts: [], ops: [] };
  if (artist === '') return plan;

  const derived = new Map(derivation.scenes.map((scene) => [scene.s, scene]));
  for (const song of derivation.songs) {
    const missing = song.scenes.filter((scene) => derived.get(scene)?.artist === null);
    if (missing.length === 0) continue;

    const stated = song.observed.artist;
    const compatible = stated.length === 0 || (stated.length === 1 && stated[0] === wanted);
    if (!compatible) {
      plan.conflicts.push({ song: song.name, artists: [...stated] });
      continue;
    }

    const ops = titleOps(before, missing, { artist });
    if (ops.length === 0) continue;
    plan.songs.push(song.name);
    plan.ops.push(...ops);
  }
  return plan;
}
