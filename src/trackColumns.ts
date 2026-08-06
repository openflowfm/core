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

/**
 * One rendered grid column.
 *
 * Both variants carry `group`, and in both it means the same thing: the group
 * whose color band this column sits in. For a member track that's its parent;
 * for a group track it's *itself*, because the group track heads its own band.
 * Reading `c.group` therefore colors any column without asking which kind it is.
 */
export type Column<T extends GroupableTrack> =
  | {
      kind: 'track';
      track: T;
      /** The group this column belongs to, or null when ungrouped. */
      group: T | null;
    }
  | {
      kind: 'group';
      /** The group track itself. It is a real Live track with real clip slots. */
      group: T;
      /**
       * Indexes of the non-group tracks beneath it, at any depth. What the
       * group slot fires, and what the cell counts.
       */
      members: number[];
      /** Whether its members are hidden behind it right now. */
      collapsed: boolean;
    };

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
 * A group track is always a column, collapsed or not — it is a real track in
 * Live with real clip slots, and its slot fires every clip in the group at that
 * scene. Collapsing hides its *members*, not the group; that's Live's own
 * behaviour and the reason this needs no separate "stands in for" column kind.
 *
 * Descendants of a collapsed group drop out entirely, including nested groups,
 * which is why this tests ancestry rather than the immediate parent. Live orders
 * its track list with a group ahead of its members, so walking that order puts
 * each group column to the left of what it contains without sorting anything.
 */
export function buildColumns<T extends GroupableTrack>(
  tracks: readonly T[],
  collapsed: ReadonlySet<number>,
): Column<T>[] {
  const index = byIndex(tracks);
  const out: Column<T>[] = [];

  for (const t of tracks) {
    // Anything under a collapsed group is hidden behind that group's column.
    // A collapsed group's own column survives this: the walk starts at its
    // parent, so a group is never its own ancestor.
    if (nearestAncestorIn(index, t, collapsed) >= 0) continue;

    if (t.isGroup) {
      out.push({
        kind: 'group',
        group: t,
        members: membersOf(tracks, t),
        collapsed: collapsed.has(t.i),
      });
      continue;
    }
    out.push({
      kind: 'track',
      track: t,
      group: t.groupIndex >= 0 ? (index.get(t.groupIndex) ?? null) : null,
    });
  }
  return out;
}

/**
 * Whether `column` begins a new color band — the first column of a group's run.
 *
 * The grid used to draw grouping as a header row of spans above the track
 * names. It doesn't any more: a group track carries its own name in the track
 * header, so a second row saying the same word was redundant. What the span row
 * did carry was the *extent* of a group, and that survives as a colored rule
 * along the top of each column in the run. This says where a run starts, so
 * the left end can be capped and two adjacent groups never read as one.
 *
 * Live draws that rule as one unbroken bar, crossing the gaps between headers.
 * Ours is still segment-per-column — the gaps are `border-spacing`, which the
 * sticky header already paints into, and bridging them is a separate problem
 * from the color it's bridging.
 *
 * A group column always starts a band. It's the leftmost column of its own
 * group, including when it's nested — a group inside another begins a run in
 * its own color rather than continuing its parent's, the same "immediate parent
 * only" rule the span row followed.
 */
export function startsBand<T extends GroupableTrack>(
  columns: readonly Column<T>[],
  at: number,
): boolean {
  const c = columns[at];
  if (c === undefined || c.group === null) return false;
  if (c.kind === 'group') return true;
  const prev = columns[at - 1];
  return prev === undefined || prev.group !== c.group;
}

/** Every group track, in track order — what the collapse-all control acts on. */
export function groupsOf<T extends GroupableTrack>(tracks: readonly T[]): T[] {
  return tracks.filter((t) => t.isGroup);
}
