// Rectangular selection over the grid.
//
// Shift-clicking selects the block between an anchor cell and the clicked one,
// which sounds trivial and isn't: the edges of that block are positions in the
// *rendered* order, not indexes. A collapsed group removes its tracks from the
// columns entirely, and a collapsed song removes its scenes from the rows, so a
// rectangle from track 2 to track 30 must not silently pick up the twenty
// hidden tracks in between — and a rectangle from scene 5 to scene 90 must not
// pick up the collapsed song sitting between them.
//
// Both axes therefore work the same way: `columns` is the visible track indexes
// in rendered order, `rows` is the visible scene indexes. Everything here works
// in positions within those lists and only converts back at the end. Passing
// indexes that aren't in the lists is the caller saying "this isn't on screen",
// and is handled rather than trusted.

export interface Cell {
  /** Track index, in Live's own numbering. */
  t: number;
  /** Scene index. */
  s: number;
}

/**
 * The nearest visible entry to `current`, preferring the direction of travel.
 *
 * Used to rescue a position that has gone off screen — the song under the
 * active cell was collapsed, say. `rows` is ascending, so this lands you next
 * to where you were rather than at the top of the set, which is what makes
 * collapsing a song you're sitting in feel like a fold rather than a jump.
 */
function nearest(list: readonly number[], current: number, forward: boolean): number {
  if (list.length === 0) return current;
  if (forward) {
    for (const v of list) if (v > current) return v;
    return list[list.length - 1]!;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i]! < current) return list[i]!;
  return list[0]!;
}

/**
 * Every cell in the block between `a` and `b`, in row-major order.
 *
 * A cell whose track isn't in `columns`, or whose scene isn't in `rows`, yields
 * nothing rather than guessing at a position: a rectangle anchored to something
 * you can't see is not a rectangle the user drew.
 *
 * `include` filters the result. The grid passes an occupancy test through it,
 * because an empty clip slot has no name and no color and selecting thousands
 * of them would make the selection count a lie.
 */
export function cellsInBlock(
  columns: readonly number[],
  rows: readonly number[],
  a: Cell,
  b: Cell,
  include?: (cell: Cell) => boolean,
): Cell[] {
  const ca = columns.indexOf(a.t);
  const cb = columns.indexOf(b.t);
  const ra = rows.indexOf(a.s);
  const rb = rows.indexOf(b.s);
  if (ca < 0 || cb < 0 || ra < 0 || rb < 0) return [];

  const c0 = Math.min(ca, cb);
  const c1 = Math.max(ca, cb);
  const r0 = Math.min(ra, rb);
  const r1 = Math.max(ra, rb);

  const out: Cell[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = { t: columns[c]!, s: rows[r]! };
      if (!include || include(cell)) out.push(cell);
    }
  }
  return out;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * The cell one step from `from` in the given direction, or `from` itself at the
 * edge. Movement walks `columns` and `rows`, so it steps over collapsed groups
 * and collapsed songs instead of landing in them.
 *
 * A `from` that isn't on screen is rescued to the nearest visible position
 * rather than refused — getting unstuck matters more than being principled
 * about where it was.
 */
export function stepCell(
  columns: readonly number[],
  rows: readonly number[],
  from: Cell,
  d: Direction,
): Cell {
  if (d === 'up' || d === 'down') {
    if (rows.length === 0) return from;
    const at = rows.indexOf(from.s);
    if (at < 0) return { t: from.t, s: nearest(rows, from.s, d === 'down') };
    const next = at + (d === 'down' ? 1 : -1);
    if (next < 0 || next >= rows.length) return from;
    return { t: from.t, s: rows[next]! };
  }

  if (columns.length === 0) return from;
  const at = columns.indexOf(from.t);
  if (at < 0) return { t: columns[d === 'left' ? 0 : columns.length - 1]!, s: from.s };

  const next = at + (d === 'left' ? -1 : 1);
  if (next < 0 || next >= columns.length) return from;
  return { t: columns[next]!, s: from.s };
}

/**
 * The one cell the keyboard acts on — where you'd type a name, and what a
 * modified arrow key fires.
 *
 * "Active cell" from spreadsheets rather than "cursor", which in a DAW means a
 * position on the timeline. It is deliberately separate from the selection: the
 * selection is what a bulk write touches, this is what you're listening to.
 * The scene name column is one of the grid's cells too, so it can live there.
 */
export type ActiveCell =
  | { on: 'clip'; t: number; s: number }
  | { on: 'scene'; s: number };

/**
 * Move the active cell, crossing between the scene name column and the track
 * columns at the left edge.
 *
 * That crossing is the whole reason this isn't just `stepCell`: the scene column
 * is to the left of every track column but isn't in `columns`, so `left` from
 * the first track has to land on the scene, and `right` from the scene has to
 * land on the first track.
 */
export function moveActive(
  columns: readonly number[],
  rows: readonly number[],
  from: ActiveCell,
  d: Direction,
): ActiveCell {
  if (from.on === 'scene') {
    if (d === 'up' || d === 'down') {
      const next = stepCell(columns, rows, { t: -1, s: from.s }, d);
      return { on: 'scene', s: next.s };
    }
    if (d === 'right' && columns.length > 0) {
      // Sideways off a row that's gone, land somewhere visible rather than
      // carrying the hidden scene index into the track columns.
      const s = rows.indexOf(from.s) < 0 ? nearest(rows, from.s, true) : from.s;
      return { on: 'clip', t: columns[0]!, s };
    }
    return from;
  }

  if (d === 'left' && columns.indexOf(from.t) === 0) {
    return { on: 'scene', s: from.s };
  }
  const next = stepCell(columns, rows, { t: from.t, s: from.s }, d);
  return { on: 'clip', t: next.t, s: next.s };
}
