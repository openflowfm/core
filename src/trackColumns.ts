// Turning Live's flat track list into grid columns and group headers.
//
// Live stores group membership as a parent link per track, not as a tree, and
// allows groups inside groups. Everything here walks that link rather than
// inferring structure from track order, so nesting stays honest.
//
// Structurally typed rather than importing BSV.Track: this needs four fields,
// and keeping core free of the wire types is what lets it be tested without
// any of the transport around it.

export interface GroupableTrack {
  /** Position in Live's track list. */
  i: number;
  name: string;
  isGroup: boolean;
  /** Immediate parent group's index, -1 when not grouped. */
  groupIndex: number;
}

/** One rendered grid column. */
export type Column<T extends GroupableTrack> =
  | { kind: 'track'; track: T }
  | {
      kind: 'folded';
      group: T;
      /** Indexes of the non-group tracks this column stands in for. */
      members: number[];
    };

/** One cell in the group header row, spanning the columns beneath it. */
export interface HeaderSpan<T extends GroupableTrack> {
  /** `null` for a run of tracks that belong to no group. */
  group: T | null;
  span: number;
}

function byIndex<T extends GroupableTrack>(tracks: readonly T[]): Map<number, T> {
  return new Map(tracks.map((t) => [t.i, t]));
}

/**
 * Walks up the parent chain from `t`, returning the nearest ancestor present in
 * `of`, or -1. Guards against a cycle: a malformed parent link would otherwise
 * hang the render.
 */
function nearestAncestorIn<T extends GroupableTrack>(
  index: Map<number, T>,
  t: T,
  of: ReadonlySet<number>,
): number {
  const seen = new Set<number>();
  let cur = t.groupIndex;
  while (cur >= 0 && !seen.has(cur)) {
    if (of.has(cur)) return cur;
    seen.add(cur);
    cur = index.get(cur)?.groupIndex ?? -1;
  }
  return -1;
}

/** Every non-group track beneath `group`, at any depth. */
export function membersOf<T extends GroupableTrack>(
  tracks: readonly T[],
  group: T,
): number[] {
  const index = byIndex(tracks);
  const only = new Set([group.i]);
  return tracks
    .filter((t) => !t.isGroup && nearestAncestorIn(index, t, only) === group.i)
    .map((t) => t.i);
}

/**
 * The columns to render, in order.
 *
 * A collapsed group becomes a single `folded` column and its descendants drop
 * out entirely — including nested groups, which is why this tests ancestry
 * rather than the immediate parent. Group tracks themselves are never columns
 * when expanded; they're headers, and Live's own group clip slots aren't part
 * of the snapshot.
 */
export function buildColumns<T extends GroupableTrack>(
  tracks: readonly T[],
  collapsed: ReadonlySet<number>,
): Column<T>[] {
  const index = byIndex(tracks);
  const out: Column<T>[] = [];

  for (const t of tracks) {
    // Anything under a collapsed group is represented by that group's column.
    if (nearestAncestorIn(index, t, collapsed) >= 0) continue;

    if (t.isGroup) {
      if (collapsed.has(t.i)) {
        out.push({ kind: 'folded', group: t, members: membersOf(tracks, t) });
      }
      continue;
    }
    out.push({ kind: 'track', track: t });
  }
  return out;
}

/**
 * Group header cells for `columns`, one row above the track names.
 *
 * A column's header is its immediate parent group; a folded column's header is
 * the parent of the group it stands for, since the group's own name is already
 * the column label. Consecutive columns sharing a header merge into one span,
 * so the spans always total `columns.length` and the header row lines up.
 *
 * Only the immediate parent is shown. A group nested inside another renders
 * under its own name, not its grandparent's — representing arbitrary depth
 * needs a header row per level, which the grid doesn't have.
 */
export function headerSpans<T extends GroupableTrack>(
  tracks: readonly T[],
  columns: readonly Column<T>[],
): HeaderSpan<T>[] {
  const index = byIndex(tracks);
  const out: HeaderSpan<T>[] = [];

  for (const c of columns) {
    const parentIndex = c.kind === 'track' ? c.track.groupIndex : c.group.groupIndex;
    const group = parentIndex >= 0 ? (index.get(parentIndex) ?? null) : null;
    const last = out[out.length - 1];
    if (last && last.group === group) last.span++;
    else out.push({ group, span: 1 });
  }
  return out;
}

/** Every group track, in track order — what the collapse-all control acts on. */
export function groupsOf<T extends GroupableTrack>(tracks: readonly T[]): T[] {
  return tracks.filter((t) => t.isGroup);
}
