// Reading the mapping back out of the set.
//
// This is the half of the scheme that means nothing has to be stored on the
// side: run every scene name through the compiled pattern and you recover which
// song and which role it belongs to. Scenes have no stable id in the LOM, and
// after this they don't need one — the name *is* the record.
//
// Everything here is a pure function of a snapshot plus a pattern, which is the
// whole reason it lives in core/. Derivation is the step most likely to be
// subtly wrong on a real set, and it's the one that can be tested without Live
// running at all.

import type { CompiledPattern } from './namePattern.js';

/**
 * Live's own bound, lifted from an assertion in the 12.4.3 binary:
 * `maybeOutputTempo >= 20.0 && maybeOutputTempo <= 1000.0`.
 *
 * Used as the "is there a tempo here at all" test rather than comparing to -1,
 * and that's deliberate. `Scene.tempo` is documented to answer **-1** when the
 * scene has no tempo of its own, but the snapshot reads it with `gnum`, which
 * answers **0** for a property it couldn't read. Both are below any real tempo,
 * so a range check treats them identically and can't be caught out by which one
 * arrived — the same trap that has bitten `color_index`, `parseId` and the
 * palette sweep in this project.
 */
export const MIN_TEMPO = 20;

/** The scene fields derivation reads. Structurally typed over `BSV.Scene`. */
export interface SceneInput {
  i: number;
  name: string;
  /** Live's `Scene.tempo`. Below `MIN_TEMPO` means the scene has none. */
  tempo: number;
  /**
   * Live's `Scene.color_index`, or -1 for no color at all — which is not slot 0.
   * A song owns one color, so this is observed like bpm and key are.
   */
  colorIndex: number;
}

export interface DerivedScene {
  s: number;
  name: string;
  /**
   * Token values read out of the name, or `null` when it doesn't match the
   * pattern. `null` is a real answer — it means this scene isn't named by the
   * scheme yet, which during the mapping pass is most of them.
   */
  fields: Record<string, string> | null;
  /** Convenience readings of the two tokens the rest of the system acts on. */
  song: string | null;
  role: string | null;
  /** The scene's own tempo, or `null` when it follows the song's. */
  tempo: number | null;
}

/** A contiguous run of scenes carrying one song. */
export interface SongBlock {
  from: number;
  to: number;
}

export interface DerivedSong {
  /** The spelling first seen in the set. */
  name: string;
  /** Every scene carrying this song, ascending. */
  scenes: number[];
  /**
   * Those scenes as contiguous runs. More than one is a reprise — legal, since
   * a song is a label rather than a range, and worth a lint line rather than an
   * error.
   */
  blocks: SongBlock[];
  /**
   * What the *set* says this song is: the distinct values found, in order of
   * first appearance. One entry means the scenes agree; more than one is a
   * disagreement the library has to arbitrate.
   *
   * Distinct values rather than a single answer on purpose — collapsing them to
   * "the first one" would hide exactly the drift this is here to surface.
   */
  observed: {
    /** `{bpm}` as written in the names. */
    bpm: string[];
    key: string[];
    /** `Scene.tempo`, which is the same fact from Live's own property. */
    tempo: number[];
    /**
     * Palette slots the song's scenes carry. Unlike the tokens above, **-1 is a
     * value here, not an omission**: a song where half the scenes are colored
     * and half aren't is precisely the drift a one-color-per-song rule exists to
     * catch, so it reads as two observations rather than one.
     */
    colorIndex: number[];
  };
}

export interface Derivation {
  scenes: DerivedScene[];
  /** Songs in order of first appearance. */
  songs: DerivedSong[];
  /** Scene indexes whose names don't match the pattern. */
  unmapped: number[];
}

/**
 * The case-insensitive identity of a song, matching how `roleKey` treats roles.
 *
 * `Nightfall` typed in the app and `nightfall` typed into Live are one song. The
 * alternative splits a song in two over a shift key and shows it twice in the
 * catalog, which is a worse failure than the theoretical one where two genuinely
 * different songs differ only in case.
 */
export function songKey(song: string): string {
  return song.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Consecutive runs in an ascending list of scene indexes. */
export function blocksOf(scenes: readonly number[]): SongBlock[] {
  const out: SongBlock[] = [];
  for (const s of scenes) {
    const last = out[out.length - 1];
    if (last && s === last.to + 1) last.to = s;
    else out.push({ from: s, to: s });
  }
  return out;
}

/** Append `v` if it isn't already there — keeps first-appearance order. */
function push<T>(list: T[], v: T | null | undefined): void {
  if (v === null || v === undefined || v === '') return;
  if (!list.includes(v)) list.push(v);
}

/**
 * Read a name through whichever pattern gets the most out of it.
 *
 * The mapping lives in the names, so a convention change can't be a clean
 * break: switching patterns outright would make every scene in an already-named
 * set unmapped at once, the songs would vanish from the grid, and there would be
 * nothing left to select in order to rename them into the new convention.
 *
 * **Most fields wins, not first match**, and that is forced rather than chosen.
 * Every scene pattern ends up *total*: `{song}` is free and everything else is
 * optional, so any pattern matches any name by reading the whole thing as a
 * title. First-match-wins would therefore always pick whichever pattern was
 * listed first and never consult the other — the current convention would
 * swallow `Nightfall 128 Bm [verse]` as one long song name.
 *
 * Counting fields is the same rule the pattern language already applies within
 * a single pattern — *a name is read as filling as many parts as it can* — just
 * lifted one level. Ties go to the earlier pattern, so the current convention
 * wins a genuine ambiguity.
 *
 * `derive` deliberately doesn't report which pattern matched: nothing
 * downstream should branch on it, and a set is normally half-converted.
 */
function readName(
  name: string,
  patterns: readonly CompiledPattern[],
): Record<string, string> | null {
  let best: Record<string, string> | null = null;
  let bestCount = -1;
  for (const p of patterns) {
    const fields = p.parse(name);
    if (fields === null) continue;
    const count = Object.values(fields).filter((v) => v !== '').length;
    if (count > bestCount) {
      best = fields;
      bestCount = count;
    }
  }
  return best;
}

export function derive(
  scenes: readonly SceneInput[],
  pattern: CompiledPattern | readonly CompiledPattern[],
): Derivation {
  const patterns = Array.isArray(pattern)
    ? (pattern as readonly CompiledPattern[])
    : [pattern as CompiledPattern];
  const derived: DerivedScene[] = [];
  const unmapped: number[] = [];
  const songs: DerivedSong[] = [];
  const bySong = new Map<string, DerivedSong>();

  // Ascending, so `blocks` falls out of the walk and callers can't be surprised
  // by a snapshot that arrived in some other order.
  const ordered = [...scenes].sort((a, b) => a.i - b.i);

  for (const sc of ordered) {
    const fields = readName(sc.name, patterns);
    const song = fields?.song ?? null;
    const tempo = sc.tempo >= MIN_TEMPO ? sc.tempo : null;

    derived.push({
      s: sc.i,
      name: sc.name,
      fields,
      song,
      role: fields?.role ?? null,
      tempo,
    });

    if (fields === null) {
      unmapped.push(sc.i);
      continue;
    }
    if (song === null) continue; // parsed, but the pattern carries no {song}

    const key = songKey(song);
    let entry = bySong.get(key);
    if (!entry) {
      entry = {
        name: song,
        scenes: [],
        blocks: [],
        observed: { bpm: [], key: [], tempo: [], colorIndex: [] },
      };
      bySong.set(key, entry);
      songs.push(entry);
    }
    entry.scenes.push(sc.i);
    push(entry.observed.bpm, fields.bpm);
    push(entry.observed.key, fields.key);
    push(entry.observed.tempo, tempo);
    // Not through `push`: it drops `''`/null as "the name didn't say", and an
    // uncolored scene did say — it said none.
    if (!entry.observed.colorIndex.includes(sc.colorIndex)) {
      entry.observed.colorIndex.push(sc.colorIndex);
    }
  }

  for (const s of songs) s.blocks = blocksOf(s.scenes);

  return { scenes: derived, songs, unmapped };
}

/** Scene index → the song it carries, for callers that need a lookup. */
export function songByScene(d: Derivation): Map<number, DerivedSong> {
  const out = new Map<number, DerivedSong>();
  for (const song of d.songs) for (const s of song.scenes) out.set(s, song);
  return out;
}

/**
 * Widen a scene selection to every scene of every song it touches, ascending.
 *
 * This is what makes a song-scoped write song-scoped: pick one scene of
 * Nightfall and the color lands on all twelve, including a reprise sixty scenes
 * later, because a song is a label rather than a range.
 *
 * A selected scene the pattern couldn't read has no song to widen to and passes
 * through as itself. Dropping it instead would make the swatch silently do
 * nothing on exactly the scenes a mapping pass hasn't reached yet.
 */
export function scenesOfSongs(d: Derivation, scenes: readonly number[]): number[] {
  const bySong = songByScene(d);
  const out = new Set<number>();
  for (const s of scenes) {
    const song = bySong.get(s);
    if (song) for (const own of song.scenes) out.add(own);
    else out.add(s);
  }
  return [...out].sort((a, b) => a - b);
}

/** The songs a scene selection touches, in order of first appearance. */
export function songsOfScenes(d: Derivation, scenes: readonly number[]): DerivedSong[] {
  const bySong = songByScene(d);
  const seen = new Set<DerivedSong>();
  for (const s of scenes) {
    const song = bySong.get(s);
    if (song) seen.add(song);
  }
  return d.songs.filter((s) => seen.has(s));
}

/** Songs the set can't answer for consistently — the input to lint. */
export function disagreements(d: Derivation): Array<{
  song: string;
  field: 'bpm' | 'key' | 'tempo' | 'color';
  values: string[];
}> {
  const out: Array<{
    song: string;
    field: 'bpm' | 'key' | 'tempo' | 'color';
    values: string[];
  }> = [];
  for (const song of d.songs) {
    if (song.observed.bpm.length > 1) {
      out.push({ song: song.name, field: 'bpm', values: song.observed.bpm });
    }
    if (song.observed.key.length > 1) {
      out.push({ song: song.name, field: 'key', values: song.observed.key });
    }
    if (song.observed.tempo.length > 1) {
      out.push({
        song: song.name,
        field: 'tempo',
        values: song.observed.tempo.map(String),
      });
    }
    if (song.observed.colorIndex.length > 1) {
      out.push({
        song: song.name,
        field: 'color',
        values: song.observed.colorIndex.map((i) => (i < 0 ? 'none' : String(i))),
      });
    }
  }
  return out;
}
