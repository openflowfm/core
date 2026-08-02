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

/** The clip fields a shape needs. Structurally typed over `BSV.Clip`. */
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

/** The scene fields a shape needs. Structurally typed over `BSV.Scene`. */
export interface NamedScene {
  i: number;
  name: string;
}

/** One role a track plays in, and how many of the block's scenes it plays it. */
export interface RoleTally {
  /** In the spelling first seen — `roleKey` is what deduped it. */
  name: string;
  scenes: number;
}

/**
 * What one track does inside one block: which sections of the song it plays.
 */
export interface TrackShape {
  /** Distinct roles its clips fall on, in the order they first appear. */
  roles: RoleTally[];
  /** Scenes it holds a clip in whose name carries no role at all. */
  untagged: number;
  /** Scenes of the block it holds a clip in, tagged or not. */
  scenes: number;
}

/** `roles`, still carrying the scene each role was first seen on. */
interface Tallying extends RoleTally {
  first: number;
}

/**
 * Per block, per track, which sections of the song that track plays.
 *
 * This is what a folded song shows in place of the rows it's hiding, one cell
 * per track column: not just *that* the sparkle pad is used, but that it's used
 * in the choruses. "Which tracks does this song use" was the first question and
 * this answers it too — a track with nothing in the block gets no entry — but
 * the second question turned out to be the interesting one.
 *
 * **Keyed by block rather than by song**, even though folding is keyed by song.
 * A song in two runs shows two headers, and a reprise that drops the pads is a
 * genuinely different thing to look at than the first run — averaging the two
 * would hide the difference the second header exists to show. `from` is the key
 * because it's what `headers` is keyed by, and no two blocks start on the same
 * scene.
 *
 * **Roles come from `roleIn`, not from the derivation's `{role}` token**, so a
 * header summarises precisely the chips the scene rows show. The two can
 * disagree — a name the pattern reads as one long title can still carry a
 * bracketed tag — and when they do, agreeing with what's on screen matters more
 * than agreeing with the pattern.
 *
 * One pass over the clips, plus one over the scenes. A full set is thousands of
 * clips and a hundred blocks and the obvious nesting is their product; ordering
 * by first appearance is done at the end, per track, where there are a handful.
 */
export function blockTrackRoles(
  clips: readonly FilledCell[],
  scenes: readonly NamedScene[],
  blocks: readonly SongBlock[],
): Map<number, Map<number, TrackShape>> {
  const owner = ownerByScene(blocks);
  const roleAt = new Map<number, string>();
  for (const sc of scenes) {
    const role = roleIn(sc.name);
    if (role !== null) roleAt.set(sc.i, role);
  }

  // Keyed by `roleKey` while tallying — `[Chorus]` and `[chorus]` are one role,
  // and the track keeps whichever spelling it saw first.
  interface Building {
    roles: Map<string, Tallying>;
    untagged: number;
    scenes: number;
  }
  const building = new Map<number, Map<number, Building>>();
  for (const b of blocks) building.set(b.from, new Map());

  for (const c of clips) {
    const from = owner.get(c.s);
    if (from === undefined) continue; // a scene in no song — nothing to fold
    const byTrack = building.get(from)!;
    let shape = byTrack.get(c.t);
    if (!shape) {
      shape = { roles: new Map(), untagged: 0, scenes: 0 };
      byTrack.set(c.t, shape);
    }
    shape.scenes++;
    const role = roleAt.get(c.s);
    if (role === undefined) {
      shape.untagged++;
      continue;
    }
    const k = roleKey(role);
    const seen = shape.roles.get(k);
    if (!seen) shape.roles.set(k, { name: role, scenes: 1, first: c.s });
    else {
      seen.scenes++;
      // Clips arrive in whatever order the snapshot walked them, so the earliest
      // scene — not the first one seen — decides both order and spelling.
      if (c.s < seen.first) {
        seen.first = c.s;
        seen.name = role;
      }
    }
  }

  const out = new Map<number, Map<number, TrackShape>>();
  for (const [from, byTrack] of building) {
    const done = new Map<number, TrackShape>();
    for (const [t, shape] of byTrack) done.set(t, finish(shape.roles, shape));
    out.set(from, done);
  }
  return out;
}

function finish(
  roles: Map<string, Tallying>,
  of: { untagged: number; scenes: number },
): TrackShape {
  return {
    roles: [...roles.values()]
      .sort((a, b) => a.first - b.first)
      .map(({ name, scenes }) => ({ name, scenes })),
    untagged: of.untagged,
    scenes: of.scenes,
  };
}

/**
 * Several tracks' shapes as one — what a folded track group's column shows.
 *
 * `scenes` sums rather than counting distinct scenes, because it feeds a
 * per-track reading ("2 of 5 tracks used") rather than a per-scene one.
 *
 * Roles come out in the order they are met scanning the given shapes in order,
 * which is track order rather than strictly scene order. Exact enough for a
 * column standing in for several tracks, and the alternative is carrying a
 * scene index into the public type for a case where nothing reads the ordering
 * that closely.
 */
export function mergeShapes(shapes: Iterable<TrackShape>): TrackShape {
  const roles = new Map<string, RoleTally>();
  let untagged = 0;
  let scenes = 0;
  for (const shape of shapes) {
    untagged += shape.untagged;
    scenes += shape.scenes;
    for (const r of shape.roles) {
      const k = roleKey(r.name);
      const seen = roles.get(k);
      if (seen) seen.scenes += r.scenes;
      else roles.set(k, { name: r.name, scenes: r.scenes });
    }
  }
  return { roles: [...roles.values()], untagged, scenes };
}

/** Every song key in the set — what "collapse all" needs. */
export function allSongKeys(derivation: Derivation): string[] {
  return derivation.songs.map((s) => songKey(s.name));
}
