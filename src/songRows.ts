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

import { songKey, type Derivation, type SongBlock } from './derive.js';
import { roleIn, roleKey } from './roles.js';

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

/** The clip fields a fill needs. Structurally typed over `BSV.Clip`. */
export interface FilledCell {
  t: number;
  s: number;
}

/**
 * Scene index → the block that owns it.
 *
 * Blocks are disjoint runs, so what would otherwise be a search per scene is a
 * lookup. Shared by everything that summarises a block out of a flat list: a
 * full set is thousands of clips and a hundred blocks, and the obvious nesting
 * is their product.
 */
function ownerByScene(blocks: readonly SongBlock[]): Map<number, number> {
  const owner = new Map<number, number>();
  for (const b of blocks) {
    for (let s = b.from; s <= b.to; s++) owner.set(s, b.from);
  }
  return owner;
}

/**
 * Per block, how many of its scenes hold a clip in each track.
 *
 * This is what a folded song can show in place of the rows it's hiding: which
 * tracks the song actually uses, aligned under the track columns, so a set
 * folded to a table of contents still says *what's in* each entry.
 *
 * **Keyed by block rather than by song**, even though folding is keyed by song.
 * A song in two runs shows two headers, and a reprise that drops the pads is a
 * genuinely different thing to look at than the first run — averaging the two
 * into one strip would hide the difference the second header exists to show.
 * `from` is the key because it's what `headers` is keyed by, and no two blocks
 * can start on the same scene.
 *
 * One pass over the clips rather than one per block.
 */
export function blockFills(
  clips: readonly FilledCell[],
  blocks: readonly SongBlock[],
): Map<number, Map<number, number>> {
  const owner = ownerByScene(blocks);
  const fills = new Map<number, Map<number, number>>();
  for (const b of blocks) fills.set(b.from, new Map());

  for (const c of clips) {
    const from = owner.get(c.s);
    if (from === undefined) continue; // a scene in no song — nothing to fold
    const byTrack = fills.get(from)!;
    byTrack.set(c.t, (byTrack.get(c.t) ?? 0) + 1);
  }
  return fills;
}

/** The scene fields a role summary needs. Structurally typed over `BSV.Scene`. */
export interface NamedScene {
  i: number;
  name: string;
}

/** One role a block uses, and how many of its scenes carry it. */
export interface RoleTally {
  /** In the spelling first seen in the block — `roleKey` is what deduped it. */
  name: string;
  scenes: number;
}

/**
 * Per block, which roles its scenes carry, in the order they first appear.
 *
 * This is the song's *shape* — intro, verse, chorus, outro — which is the one
 * thing a header can't say by naming the song and can't say by counting its
 * scenes. Read straight out of the names, like everything else here.
 *
 * **Keyed by block, for the same reason `blockFills` is.** A reprise that is
 * chorus-only is a different shape from the run that introduced it, and merging
 * the two would hide exactly the difference the second header exists to show.
 *
 * **Roles come from `roleIn`, not from the derivation's `{role}` token**, so the
 * header summarises precisely the chips the scene rows below it show. The two
 * can disagree — a name the pattern reads as one long title can still carry a
 * bracketed tag — and when they do, agreeing with what's on screen matters more
 * than agreeing with the pattern.
 *
 * Order of first appearance is musical order, so scenes are walked ascending
 * rather than in whatever order the snapshot arrived in.
 */
export function blockRoles(
  scenes: readonly NamedScene[],
  blocks: readonly SongBlock[],
): Map<number, RoleTally[]> {
  const owner = ownerByScene(blocks);
  // Keyed by `roleKey` while tallying — `[Chorus]` and `[chorus]` are one role,
  // and the block keeps whichever spelling it saw first.
  const tallies = new Map<number, Map<string, RoleTally>>();
  for (const b of blocks) tallies.set(b.from, new Map());

  for (const sc of [...scenes].sort((a, b) => a.i - b.i)) {
    const from = owner.get(sc.i);
    if (from === undefined) continue;
    const role = roleIn(sc.name);
    if (role === null) continue;
    const byRole = tallies.get(from)!;
    const k = roleKey(role);
    const seen = byRole.get(k);
    if (seen) seen.scenes++;
    else byRole.set(k, { name: role, scenes: 1 });
  }

  // A Map iterates in insertion order, which is the first-appearance order the
  // header wants — so the strip of pills reads as the arrangement.
  return new Map([...tallies].map(([from, byRole]) => [from, [...byRole.values()]]));
}

/** Every song key in the set — what "collapse all" needs. */
export function allSongKeys(derivation: Derivation): string[] {
  return derivation.songs.map((s) => songKey(s.name));
}
