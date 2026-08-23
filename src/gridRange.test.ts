import { describe, expect, it } from 'vitest';
import { cellsInBlock, moveActive, stepCell, type Cell } from './gridRange.ts';

const key = (c: Cell) => `${c.t}:${c.s}`;

// Tracks 1, 2 and 5 are visible; 3 and 4 are inside a collapsed group.
const COLUMNS = [1, 2, 5];

/** Every scene visible — the no-collapsed-songs case. */
const rowsUpTo = (n: number) => Array.from({ length: n }, (_, i) => i);
const ROWS = rowsUpTo(10);

// Scenes 3, 4 and 5 are inside a collapsed song.
const FOLDED = [0, 1, 2, 6, 7, 8, 9];

describe('cellsInBlock', () => {
  it('fills the block between two cells', () => {
    const got = cellsInBlock(COLUMNS, ROWS, { t: 1, s: 0 }, { t: 2, s: 1 }).map(key);
    expect(got).toEqual(['1:0', '2:0', '1:1', '2:1']);
  });

  it('is order-independent — anchor may be below and right of the target', () => {
    const a = cellsInBlock(COLUMNS, ROWS, { t: 5, s: 3 }, { t: 1, s: 1 }).map(key).sort();
    const b = cellsInBlock(COLUMNS, ROWS, { t: 1, s: 1 }, { t: 5, s: 3 }).map(key).sort();
    expect(a).toEqual(b);
    expect(a).toHaveLength(9);
  });

  it('skips tracks hidden inside a collapsed group', () => {
    // 1 → 5 spans every visible column, and must not pick up 3 or 4.
    const got = cellsInBlock(COLUMNS, ROWS, { t: 1, s: 0 }, { t: 5, s: 0 }).map((c) => c.t);
    expect(got).toEqual([1, 2, 5]);
  });

  it('skips scenes hidden inside a collapsed song', () => {
    // 2 → 6 spans a collapsed song, and recoloring what you can't see is
    // exactly the damage this prevents.
    const got = cellsInBlock(COLUMNS, FOLDED, { t: 1, s: 2 }, { t: 1, s: 6 }).map(
      (c) => c.s,
    );
    expect(got).toEqual([2, 6]);
  });

  it('yields nothing when an endpoint is not a visible column', () => {
    expect(cellsInBlock(COLUMNS, ROWS, { t: 3, s: 0 }, { t: 5, s: 2 })).toEqual([]);
    expect(cellsInBlock(COLUMNS, ROWS, { t: 1, s: 0 }, { t: 4, s: 2 })).toEqual([]);
  });

  it('yields nothing when an endpoint is not a visible row', () => {
    expect(cellsInBlock(COLUMNS, FOLDED, { t: 1, s: 4 }, { t: 5, s: 8 })).toEqual([]);
    expect(cellsInBlock(COLUMNS, FOLDED, { t: 1, s: 0 }, { t: 5, s: 3 })).toEqual([]);
  });

  it('is a single cell when the endpoints match', () => {
    expect(cellsInBlock(COLUMNS, ROWS, { t: 2, s: 7 }, { t: 2, s: 7 }).map(key)).toEqual([
      '2:7',
    ]);
  });

  it('applies the include filter', () => {
    const occupied = new Set(['1:0', '5:1']);
    const got = cellsInBlock(COLUMNS, ROWS, { t: 1, s: 0 }, { t: 5, s: 1 }, (c) =>
      occupied.has(key(c)),
    ).map(key);
    expect(got).toEqual(['1:0', '5:1']);
  });
});

describe('stepCell', () => {
  it('moves within the column vertically', () => {
    expect(stepCell(COLUMNS, ROWS, { t: 2, s: 4 }, 'down')).toEqual({ t: 2, s: 5 });
    expect(stepCell(COLUMNS, ROWS, { t: 2, s: 4 }, 'up')).toEqual({ t: 2, s: 3 });
  });

  it('clamps at the first and last scene', () => {
    expect(stepCell(COLUMNS, ROWS, { t: 2, s: 0 }, 'up')).toEqual({ t: 2, s: 0 });
    expect(stepCell(COLUMNS, ROWS, { t: 2, s: 9 }, 'down')).toEqual({ t: 2, s: 9 });
  });

  it('steps over a collapsed song vertically', () => {
    // The point of the whole change: ⌘↓ must not descend into scenes you can't
    // see and fire them.
    expect(stepCell(COLUMNS, FOLDED, { t: 2, s: 2 }, 'down')).toEqual({ t: 2, s: 6 });
    expect(stepCell(COLUMNS, FOLDED, { t: 2, s: 6 }, 'up')).toEqual({ t: 2, s: 2 });
  });

  it('rescues a cell stranded inside a song that was just collapsed', () => {
    // Nearest visible in the direction of travel, not the top of the set —
    // collapsing the song you're sitting in should feel like a fold, not a jump.
    expect(stepCell(COLUMNS, FOLDED, { t: 2, s: 4 }, 'down')).toEqual({ t: 2, s: 6 });
    expect(stepCell(COLUMNS, FOLDED, { t: 2, s: 4 }, 'up')).toEqual({ t: 2, s: 2 });
  });

  it('steps over collapsed tracks horizontally', () => {
    // 2 → 5, not 2 → 3.
    expect(stepCell(COLUMNS, ROWS, { t: 2, s: 1 }, 'right')).toEqual({ t: 5, s: 1 });
    expect(stepCell(COLUMNS, ROWS, { t: 5, s: 1 }, 'left')).toEqual({ t: 2, s: 1 });
  });

  it('stays put at the horizontal edges', () => {
    expect(stepCell(COLUMNS, ROWS, { t: 1, s: 1 }, 'left')).toEqual({ t: 1, s: 1 });
    expect(stepCell(COLUMNS, ROWS, { t: 5, s: 1 }, 'right')).toEqual({ t: 5, s: 1 });
  });

  it('rescues a cursor stranded on a now-hidden track', () => {
    expect(stepCell(COLUMNS, ROWS, { t: 3, s: 2 }, 'left')).toEqual({ t: 1, s: 2 });
    expect(stepCell(COLUMNS, ROWS, { t: 3, s: 2 }, 'right')).toEqual({ t: 5, s: 2 });
  });

  it('does not move when there is nothing visible on that axis', () => {
    expect(stepCell([], ROWS, { t: 1, s: 2 }, 'right')).toEqual({ t: 1, s: 2 });
    expect(stepCell(COLUMNS, [], { t: 1, s: 2 }, 'down')).toEqual({ t: 1, s: 2 });
  });
});

describe('moveActive', () => {
  it('crosses from the first track column into the scene column', () => {
    expect(moveActive(COLUMNS, ROWS, { on: 'clip', t: 1, s: 3 }, 'left')).toEqual({
      on: 'scene',
      s: 3,
    });
  });

  it('crosses back out of the scene column into the first track', () => {
    expect(moveActive(COLUMNS, ROWS, { on: 'scene', s: 3 }, 'right')).toEqual({
      on: 'clip',
      t: 1,
      s: 3,
    });
  });

  it('does not leave the scene column to the left', () => {
    const at: ReturnType<typeof moveActive> = { on: 'scene', s: 3 };
    expect(moveActive(COLUMNS, ROWS, at, 'left')).toEqual(at);
  });

  it('walks scenes vertically in the scene column', () => {
    expect(moveActive(COLUMNS, ROWS, { on: 'scene', s: 3 }, 'down')).toEqual({
      on: 'scene',
      s: 4,
    });
    expect(moveActive(COLUMNS, ROWS, { on: 'scene', s: 0 }, 'up')).toEqual({
      on: 'scene',
      s: 0,
    });
    expect(moveActive(COLUMNS, ROWS, { on: 'scene', s: 9 }, 'down')).toEqual({
      on: 'scene',
      s: 9,
    });
  });

  it('walks scene names over a collapsed song', () => {
    expect(moveActive(COLUMNS, FOLDED, { on: 'scene', s: 2 }, 'down')).toEqual({
      on: 'scene',
      s: 6,
    });
  });

  it('steps over collapsed tracks without touching the scene column', () => {
    expect(moveActive(COLUMNS, ROWS, { on: 'clip', t: 2, s: 1 }, 'right')).toEqual({
      on: 'clip',
      t: 5,
      s: 1,
    });
    expect(moveActive(COLUMNS, ROWS, { on: 'clip', t: 5, s: 1 }, 'left')).toEqual({
      on: 'clip',
      t: 2,
      s: 1,
    });
  });

  it('stays in the track columns at the right edge', () => {
    expect(moveActive(COLUMNS, ROWS, { on: 'clip', t: 5, s: 1 }, 'right')).toEqual({
      on: 'clip',
      t: 5,
      s: 1,
    });
  });

  it('clamps a scene index past the end of a shorter set', () => {
    expect(moveActive(COLUMNS, rowsUpTo(2), { on: 'scene', s: 7 }, 'right')).toEqual({
      on: 'clip',
      t: 1,
      s: 1,
    });
  });

  it('does not carry a hidden scene index sideways into the track columns', () => {
    expect(moveActive(COLUMNS, FOLDED, { on: 'scene', s: 4 }, 'right')).toEqual({
      on: 'clip',
      t: 1,
      s: 6,
    });
  });

  it('has nowhere to go right from the scene column with every group collapsed', () => {
    const at: ReturnType<typeof moveActive> = { on: 'scene', s: 1 };
    expect(moveActive([], ROWS, at, 'right')).toEqual(at);
  });
});
