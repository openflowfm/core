// The set as this app understands it, built once.
//
// `derive()` reads the mapping back out of the scene names; this packages that
// reading into the shape everything else consumes, with the facts already
// rendered. The point is that **nothing downstream parses a name again** — ask
// for the songs in the set and you get them, without compiling a pattern or
// knowing that names are where the mapping lives.
//
// It exists because that parse was happening twice. The bridge ran `derive()`
// to build Push's song list and every browser tab ran the same `derive()` over
// the same scene names to draw the grid: two answers to one question, computed
// from one input by one function, which is precisely the drift this project's
// naming scheme is built to avoid. The bridge owns the answer now.
//
// **Scoped to the scene/song layer**, and that boundary is load-bearing rather
// than arbitrary: everything here is a function of scene names and
// `Scene.tempo`, which is exactly what a `sceneRows` delta carries. Fold in
// anything that reads the clips — `blockTrackRoles`, say — and every clip edit
// in the set rebuilds the whole model.

import { songKey, type Derivation } from './derive.js';
import { showFact, songFacts } from './songRows.js';

/**
 * The derived layer from one derivation, ready to ship.
 *
 * `rev` is the snapshot revision this was read from, so a holder can tell
 * whether the model in hand describes the snapshot in hand. It is passed in
 * rather than read from the derivation because a derivation is a pure function
 * of scene rows and has no idea which revision produced them.
 */
export function buildSetModel(d: Derivation, rev: number): BSV.SetModel {
  const songs: BSV.SongEntry[] = d.songs.map((song) => {
    const facts = songFacts(song);
    return {
      songKey: songKey(song.name),
      name: song.name,
      scenes: song.scenes,
      blocks: song.blocks.map((b) => ({ from: b.from, to: b.to })),
      bpm: facts.bpm,
      key: facts.key,
      artist: facts.artist,
      tag: facts.tag,
      bpmClash: song.observed.bpm.length > 1,
      keyClash: song.observed.key.length > 1,
      artistClash: song.observed.artist.length > 1,
      tagClash: song.observed.tag.length > 1,
      // A song is one color, so a header showing the first scene's while the
      // rest of the block disagrees would be a confident lie. -1 covers both
      // "no color" and "more than one"; `colorClash` is what separates them.
      colorIndex:
        song.observed.colorIndex.length > 1 ? -1 : (song.observed.colorIndex[0] ?? -1),
      colorClash: song.observed.colorIndex.length > 1,
      firstSceneTempo: song.firstSceneTempo,
      tempoScenes: song.tempoScenes,
    };
  });

  const songByScene: Record<string, string> = {};
  for (const song of songs) for (const s of song.scenes) songByScene[String(s)] = song.songKey;

  return { rev, songs, songByScene, unmapped: d.unmapped };
}

/**
 * The song a scene carries, or `undefined`.
 *
 * A helper rather than a `Map` on the model itself, because the model crosses
 * the wire as JSON and a `Map` does not survive `JSON.stringify` — it arrives
 * as `{}`, silently, with every lookup then missing. Consumers that do this in
 * a loop should build their own `Map` once.
 */
export function songAt(model: BSV.SetModel, scene: number): BSV.SongEntry | undefined {
  const key = model.songByScene[String(scene)];
  return key === undefined ? undefined : model.songs.find((s) => s.songKey === key);
}
