// Rectangular selection over the grid.
//
// Shift-clicking selects the block between an anchor cell and the clicked one,
// which sounds trivial and isn't: the horizontal edges of that block are
// positions in the *rendered column order*, not track indexes. A collapsed
// group removes its members from the columns entirely, so a rectangle from
// track 2 to track 30 must not silently pick up the twenty hidden tracks in
// between. Everything here works in column positions and only converts back to
// track indexes at the end.

export interface Cell {
  /** Track index, in Live's own numbering. */
  t: number;
  /** Scene index. */
  s: number;
}

/**
 * Every cell in the block between `a` and `b`, in row-major order.
 *
 * `columns` is the visible track indexes in rendered order — see
 * `buildColumns`. A cell whose track isn't in `columns` (its group was
 * collapsed after the anchor was set) yields nothing rather than guessing at a
 * position: a rectangle anchored to something you can't see is not a rectangle
 * the user drew.
 *
 * `include` filters the result. The grid passes an occupancy test through it,
 * because an empty clip slot has no name and no color and selecting thousands
 * of them would make the selection count a lie.
 */
export function cellsInBlock(
  columns: readonly number[],
  a: Cell,
  b: Cell,
  include?: (cell: Cell) => boolean,
): Cell[] {
  const ca = columns.indexOf(a.t);
  const cb = columns.indexOf(b.t);
  if (ca < 0 || cb < 0) return [];

  const c0 = Math.min(ca, cb);
  const c1 = Math.max(ca, cb);
  const s0 = Math.min(a.s, b.s);
  const s1 = Math.max(a.s, b.s);

  const out: Cell[] = [];
  for (let s = s0; s <= s1; s++) {
    for (let c = c0; c <= c1; c++) {
      const cell = { t: columns[c], s };
      if (!include || include(cell)) out.push(cell);
    }
  }
  return out;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * The cell one step from `from` in the given direction, or `from` itself at the
 * edge. Horizontal movement walks `columns`, so it steps over collapsed groups
 * instead of landing in them.
 *
 * `sceneCount` bounds the vertical edges. A `from` whose track isn't visible
 * moves to the nearest end of the column list rather than refusing to move —
 * getting unstuck matters more than being principled about where it was.
 */
export function stepCell(
  columns: readonly number[],
  sceneCount: number,
  from: Cell,
  d: Direction,
): Cell {
  if (d === 'up') return { t: from.t, s: Math.max(0, from.s - 1) };
  if (d === 'down') return { t: from.t, s: Math.min(sceneCount - 1, from.s + 1) };
  if (columns.length === 0) return from;

  const at = columns.indexOf(from.t);
  if (at < 0) return { t: columns[d === 'left' ? 0 : columns.length - 1], s: from.s };

  const next = d === 'left' ? at - 1 : at + 1;
  if (next < 0 || next >= columns.length) return from;
  return { t: columns[next], s: from.s };
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
  sceneCount: number,
  from: ActiveCell,
  d: Direction,
): ActiveCell {
  const s = (n: number) => Math.min(Math.max(n, 0), Math.max(0, sceneCount - 1));

  if (from.on === 'scene') {
    if (d === 'up') return { on: 'scene', s: s(from.s - 1) };
    if (d === 'down') return { on: 'scene', s: s(from.s + 1) };
    if (d === 'right' && columns.length > 0) {
      return { on: 'clip', t: columns[0], s: s(from.s) };
    }
    return from;
  }

  if (d === 'left' && columns.indexOf(from.t) === 0) return { on: 'scene', s: s(from.s) };
  const next = stepCell(columns, sceneCount, { t: from.t, s: from.s }, d);
  return { on: 'clip', t: next.t, s: next.s };
}
