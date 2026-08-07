// A running order of songs → the order the *scenes* have to end up in.
//
// The grid's drag answers "put this run of scenes there". This answers the
// question a set list asks instead: here are the songs, in the order I want to
// play them — where does every scene go? One is a move, the other is a
// permutation of the whole set, and `sceneMove.ts` turns this into the plan.
//
// Two rules do all the work, and both exist because **a song is a label rather
// than a range** (see derive.ts):
//
//   1. **A song is one row, so applying gathers it.** A song found in two runs
//      is one entry here and comes out as one run. That's a real change to the
//      set — the reprise stops being a reprise — so whatever renders this has to
//      say so before it writes.
//   2. **A scene the pattern couldn't read travels with the song it sits after.**
//      It isn't in the running order and can't be placed by it, and the
//      alternative — pinning it to the index it holds now — cuts a song in half
//      the moment the songs around it change length. Above the first song it
//      stays at the top of the set, which is the one place that has no song to
//      follow.
//
// Every scene comes out exactly once whatever the caller passes, because
// `planSceneReorder` refuses anything else and being refused is not a useful
// answer to give a set list.

/** The scene fields an ordering reads. Structurally typed over a derivation. */
export interface OrderedScene {
  s: number;
  /**
   * `songKey` of the song this scene carries, or `null` when the pattern
   * couldn't read a song out of its name.
   */
  songKey: string | null;
}

export interface SongPlacement {
  songKey: string;
  /** Its scenes, ascending — one run, however many it arrived in. */
  scenes: number[];
  /**
   * Unmapped scenes that sit after this song in the set today and move with it.
   * Several separated runs collapse into one, in the order they were found.
   */
  trailing: number[];
}

export interface SceneOrdering {
  /** Every scene of the set, in the order the running order puts them. */
  order: number[];
  /** Unmapped scenes above the first song. They stay at the top. */
  head: number[];
  /** One per song, in the order it will be played. */
  placements: SongPlacement[];
}

/** Song metadata the running-order sorter may compare. */
export interface SortableSong {
  songKey: string;
  name: string;
  tag: string;
  key: string;
  bpm: string;
}

export type SongSortField = 'name' | 'tag' | 'key' | 'bpm';
export type SortDirection = 'asc' | 'desc';

export interface SongSortCriterion {
  field: SongSortField;
  direction: SortDirection;
}

const WORDS = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function compareField(
  a: SortableSong,
  b: SortableSong,
  field: SongSortField,
  direction: SortDirection,
): number {
  const av = a[field].trim();
  const bv = b[field].trim();

  // Missing metadata always comes last. Reversing a sort changes the values,
  // not whether unnamed/unknown songs interrupt every useful group.
  if (av === '' || bv === '') return av === bv ? 0 : av === '' ? 1 : -1;

  if (field === 'bpm') {
    const an = Number(av);
    const bn = Number(bv);
    // A disagreement renders as `120 / 128`; compare that as text rather than
    // pretending its first number is the song's answer.
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      return direction === 'asc' ? an - bn : bn - an;
    }
  }
  const words = WORDS.compare(av, bv);
  return direction === 'asc' ? words : -words;
}

/**
 * Sort songs lexicographically through an arbitrary hierarchy of metadata.
 *
 * Each criterion only breaks ties left by the one before it: Tag → Key → Name
 * therefore forms tag groups, key groups inside them, then alphabetizes each
 * leaf. Exact ties preserve the set's current order so applying a partial
 * hierarchy never creates movement the rule did not ask for.
 */
export function sortSongOrder(
  songs: readonly SortableSong[],
  criteria: readonly SongSortCriterion[],
): string[] {
  return songs
    .map((song, index) => ({ song, index }))
    .sort((a, b) => {
      for (const criterion of criteria) {
        const compared = compareField(
          a.song,
          b.song,
          criterion.field,
          criterion.direction,
        );
        if (compared !== 0) return compared;
      }
      return a.index - b.index;
    })
    .map(({ song }) => song.songKey);
}

/**
 * Lay the set out to match `songOrder`.
 *
 * `songOrder` is `songKey`s. Anything in it the set doesn't carry is ignored,
 * and any song the set carries that it *omits* is appended in first-appearance
 * order — a running order that has gone stale against a fresh snapshot then
 * still describes the whole set rather than throwing in the middle of a render
 * or, worse, quietly leaving a song out of the plan.
 */
export function orderScenes(
  scenes: readonly OrderedScene[],
  songOrder: readonly string[],
): SceneOrdering {
  const head: number[] = [];
  const bySong = new Map<string, SongPlacement>();
  /** Songs in first-appearance order — the fallback for anything unlisted. */
  const found: string[] = [];

  let current: SongPlacement | null = null;
  for (const sc of [...scenes].sort((a, b) => a.s - b.s)) {
    if (sc.songKey === null) {
      if (current === null) head.push(sc.s);
      else current.trailing.push(sc.s);
      continue;
    }
    let song = bySong.get(sc.songKey);
    if (!song) {
      song = { songKey: sc.songKey, scenes: [], trailing: [] };
      bySong.set(sc.songKey, song);
      found.push(sc.songKey);
    }
    song.scenes.push(sc.s);
    current = song;
  }

  const seen = new Set<string>();
  const placements: SongPlacement[] = [];
  for (const key of [...songOrder, ...found]) {
    const song = bySong.get(key);
    if (!song || seen.has(key)) continue;
    seen.add(key);
    placements.push(song);
  }

  const order = [...head];
  for (const p of placements) order.push(...p.scenes, ...p.trailing);
  return { order, head, placements };
}
