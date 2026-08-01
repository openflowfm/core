// Songs as rows in the grid: where the headers go, and what a collapsed song
// hides. The row-wise mirror of `trackColumns.ts`, and deliberately shaped like
// it — one collapses columns into a group header, this collapses rows into a
// song header.
//
// A header goes above each **block**, not each song. A song is a label rather
// than a range, so its scenes can come in several runs, and heading only the
// first would leave the second run visually attached to whatever song precedes
// it — which is the opposite of segmenting the grid.
//
// Collapsing, though, is keyed by **song**: folding "Nightfall" folds all of it,
// including a reprise sixty scenes later. Two blocks then show two headers,
// which is honest — the set really does contain that song twice.

import { songKey, type Derivation } from './derive.js';

/**
 * One header row. Every field is a primitive on purpose: this crosses into a
 * memoized React row, and an object or array prop would re-render every header
 * on each change. Same reasoning as `marksByScene` in the grid.
 */
export interface SongHeader {
  /** Case-insensitive identity — what the collapsed set holds. */
  songKey: string;
  /** Display name, in the spelling the set uses. */
  song: string;
  /** First and last scene of this block. */
  from: number;
  to: number;
  /** Scenes in this block. */
  scenes: number;
  /** 1-based position of this block, and how many the song has. */
  block: number;
  blocks: number;
  /** Rendered facts. `''` when the set says nothing, `a / b` when it disagrees. */
  bpm: string;
  /** The musical key, not `songKey`. */
  key: string;
  tempo: string;
  /** True when any rendered fact above is a disagreement rather than a value. */
  clash: boolean;
  /**
   * The palette slot the whole song carries, or -1 when it has none *or* when
   * its scenes disagree. A song is one color, so a header showing the first
   * scene's color while the rest of the block is something else would be a
   * confident lie — `colorClash` separates the two cases for whoever renders it.
   */
  colorIndex: number;
  /** True when the song's scenes hold more than one color between them. */
  colorClash: boolean;
  collapsed: boolean;
}

export interface SongRows {
  /** Scene index → the header that sits directly above it. */
  headers: Map<number, SongHeader>;
  /** Scenes inside a collapsed song. */
  hidden: ReadonlySet<number>;
  /**
   * Visible scene indexes in render order — what the arrow keys walk and what
   * block selection spans. The row-wise counterpart of `buildColumns`.
   */
  rows: number[];
}

/** `''`, the value, or every value when the song's scenes disagree. */
function show(values: readonly (string | number)[]): string {
  return values.length === 0 ? '' : values.join(' / ');
}

export function songRows(
  derivation: Derivation,
  collapsed: ReadonlySet<string> = new Set(),
): SongRows {
  const headers = new Map<number, SongHeader>();
  const hidden = new Set<number>();

  for (const song of derivation.songs) {
    const key = songKey(song.name);
    const isCollapsed = collapsed.has(key);
    const clash =
      song.observed.bpm.length > 1 ||
      song.observed.key.length > 1 ||
      song.observed.tempo.length > 1;
    // Color is kept out of `clash` on purpose: that one annotates the facts
    // strip, and a color disagreement is shown by the header's own band.
    const colorClash = song.observed.colorIndex.length > 1;
    const colorIndex = colorClash ? -1 : (song.observed.colorIndex[0] ?? -1);

    song.blocks.forEach((block, i) => {
      headers.set(block.from, {
        songKey: key,
        song: song.name,
        from: block.from,
        to: block.to,
        scenes: block.to - block.from + 1,
        block: i + 1,
        blocks: song.blocks.length,
        bpm: show(song.observed.bpm),
        key: show(song.observed.key),
        tempo: show(song.observed.tempo),
        clash,
        colorIndex,
        colorClash,
        collapsed: isCollapsed,
      });
    });

    if (isCollapsed) for (const s of song.scenes) hidden.add(s);
  }

  // Walk the derivation's own scene list rather than 0..sceneCount so the row
  // order can't disagree with what the grid renders.
  const rows = derivation.scenes.map((sc) => sc.s).filter((s) => !hidden.has(s));

  return { headers, hidden, rows };
}

/** Every song key in the set — what "collapse all" needs. */
export function allSongKeys(derivation: Derivation): string[] {
  return derivation.songs.map((s) => songKey(s.name));
}
