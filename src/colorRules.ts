// Coloring every song in the set from a rule instead of a swatch at a time.
//
// **A song is one color** (see ui/README.md) — a solid band in Live's own
// session view is what a hundred-song set is navigated by. Which color is
// arbitrary song by song and not arbitrary across a set: colored by key, the
// bands say what will mix into what; colored by bpm, they say where the set
// changes gear. That's a rule over the whole set, and it's a pure function of
// what derivation already read out of the names.
//
// Three things are deliberate:
//
// - **A rule never invents the fact it keys on.** A song whose scenes don't
//   state a key is not "the no-key color", it's left alone — `skipped` says
//   which, so the caller can say so out loud. Painting a song by a fact the set
//   never stated is how a color stops meaning anything.
// - **The allowed colors are the caller's**, and the rule wraps around them
//   rather than reaching into the rest of the palette. Live's 70 colors include
//   several that are unreadable next to each other, and a set list that uses
//   eight of them deliberately is worth more than one that uses all seventy.
// - **`random` takes a seed.** core stays pure, the roll is reproducible, and
//   re-rolling is the caller passing a different number.

/** How a color is chosen for each song. */
export type ColorRule = 'key' | 'bpm' | 'rainbow' | 'random';

/** The song fields a rule reads. Built from a `DerivedSong` by the caller. */
export interface SongColorInput {
  /** Case-folded identity, from `songKey`. */
  songKey: string;
  /**
   * The musical key the set states — not `songKey`. Empty when the names don't
   * say, and empty when the song's scenes disagree: a song the set can't answer
   * for is a song this can't color by that answer.
   */
  key: string;
  /** The bpm the set states, or `null` for the same two reasons. */
  bpm: number | null;
}

/** One value of the fact a rule keys on, and the color it took. */
export interface ColorGroup {
  /** `Bm`, or `128` — as the set spells it. */
  label: string;
  colorIndex: number;
  /** How many songs landed here. */
  songs: number;
}

export interface SongColorPlan {
  /** `songKey` → palette slot. A song the rule couldn't answer for is absent. */
  colors: Map<string, number>;
  /** Songs left as they are, in input order. */
  skipped: string[];
  /**
   * What each value of the fact was given, for a rule that groups by one.
   * Empty for `rainbow` and `random`, where every song is its own group and the
   * legend would just be the song list again.
   */
  legend: ColorGroup[];
}

/**
 * mulberry32 — small, fast, and identical everywhere, which is what makes a
 * seeded roll worth having. `Math.random()` in here would make the preview and
 * the write two different sets of colors.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values: readonly number[], next: () => number): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * A color per song, dealt at random but **never twice in a row**.
 *
 * Dealt from a shuffled bag rather than drawn independently, so eight allowed
 * colors over twenty songs uses all eight before it repeats any. Pure random
 * over a small palette clumps, and a clump of one color across three adjacent
 * songs is the exact thing the band is there to prevent.
 */
function dealRandom(count: number, allowed: readonly number[], seed: number): number[] {
  const next = rng(seed);
  const out: number[] = [];
  let bag: number[] = [];
  for (let i = 0; i < count; i++) {
    if (bag.length === 0) {
      bag = shuffled(allowed, next);
      // A fresh bag can open with the color the last one closed on. One swap
      // fixes it, and there's nothing to fix when there's only one color to
      // give out.
      if (bag.length > 1 && bag[bag.length - 1] === out[out.length - 1]) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
      }
    }
    out.push(bag.pop()!);
  }
  return out;
}

/** The fact a grouping rule keys on, or `null` when the song doesn't state it. */
function factOf(song: SongColorInput, rule: 'key' | 'bpm'): string | null {
  if (rule === 'bpm') return song.bpm === null ? null : String(song.bpm);
  const key = song.key.trim();
  return key === '' ? null : key;
}

/**
 * What color every song should be.
 *
 * Songs arrive in set order and `rainbow` follows it, which is what makes that
 * rule read as a progression down the grid rather than as noise.
 *
 * Grouping rules order their groups by the fact rather than by the song: bpm
 * ascending, so the palette walks with the tempo, and key by first appearance,
 * because keys have no order anyone agrees on and first appearance is the one
 * derivation already uses.
 */
export function planSongColors(
  songs: readonly SongColorInput[],
  rule: ColorRule,
  allowed: readonly number[],
  seed = 0,
): SongColorPlan {
  const colors = new Map<string, number>();
  const skipped: string[] = [];
  const legend: ColorGroup[] = [];

  // Nothing to hand out. Every song is skipped rather than colored slot 0,
  // which is a real color and not "none".
  if (allowed.length === 0) {
    return { colors, skipped: songs.map((s) => s.songKey), legend };
  }

  if (rule === 'rainbow' || rule === 'random') {
    const dealt =
      rule === 'random'
        ? dealRandom(songs.length, allowed, seed)
        : songs.map((_, i) => allowed[i % allowed.length]!);
    songs.forEach((song, i) => colors.set(song.songKey, dealt[i]!));
    return { colors, skipped, legend };
  }

  // Group first, then hand out colors, so the wrap-around falls on the number of
  // distinct keys or tempos rather than on the number of songs.
  const groups = new Map<string, { label: string; songs: string[] }>();
  for (const song of songs) {
    const fact = factOf(song, rule);
    if (fact === null) {
      skipped.push(song.songKey);
      continue;
    }
    // Case-folded, for the same reason `songKey` and `roleKey` fold: `Bm` typed
    // here and `bm` typed into Live are one key, not two colors.
    const at = fact.toLowerCase();
    const group = groups.get(at);
    if (group) group.songs.push(song.songKey);
    else groups.set(at, { label: fact, songs: [song.songKey] });
  }

  const ordered =
    rule === 'bpm'
      ? [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
      : [...groups.entries()];

  ordered.forEach(([, group], i) => {
    const colorIndex = allowed[i % allowed.length]!;
    for (const songKey of group.songs) colors.set(songKey, colorIndex);
    legend.push({ label: group.label, colorIndex, songs: group.songs.length });
  });

  return { colors, skipped, legend };
}
