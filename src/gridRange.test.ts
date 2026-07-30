import { describe, expect, it } from 'vitest';
import { cellsInBlock, moveActive, stepCell, type Cell } from './gridRange.js';

const key = (c: Cell) => `${c.t}:${c.s}`;

// Tracks 1, 2 and 5 are visible; 3 and 4 are inside a collapsed group.
const COLUMNS = [1, 2, 5];

describe('cellsInBlock', () => {
  it('fills the block between two cells', () => {
    const got = cellsInBlock(COLUMNS, { t: 1, s: 0 }, { t: 2, s: 1 }).map(key);
    expect(got).toEqual(['1:0', '2:0', '1:1', '2:1']);
  });

  it('is order-independent — anchor may be below and right of the target', () => {
    const a = cellsInBlock(COLUMNS, { t: 5, s: 3 }, { t: 1, s: 1 }).map(key).sort();
    const b = cellsInBlock(COLUMNS, { t: 1, s: 1 }, { t: 5, s: 3 }).map(key).sort();
    expect(a).toEqual(b);
    expect(a).toHaveLength(9);
  });

  it('skips tracks hidden inside a collapsed group', () => {
    // 1 → 5 spans every visible column, and must not pick up 3 or 4.
    const got = cellsInBlock(COLUMNS, { t: 1, s: 0 }, { t: 5, s: 0 }).map((c) => c.t);
    expect(got).toEqual([1, 2, 5]);
  });

  it('yields nothing when an endpoint is not a visible column', () => {
    expect(cellsInBlock(COLUMNS, { t: 3, s: 0 }, { t: 5, s: 2 })).toEqual([]);
    expect(cellsInBlock(COLUMNS, { t: 1, s: 0 }, { t: 4, s: 2 })).toEqual([]);
  });

  it('is a single cell when the endpoints match', () => {
    expect(cellsInBlock(COLUMNS, { t: 2, s: 7 }, { t: 2, s: 7 }).map(key)).toEqual(['2:7']);
  });

  it('applies the include filter', () => {
    const occupied = new Set(['1:0', '5:1']);
    const got = cellsInBlock(COLUMNS, { t: 1, s: 0 }, { t: 5, s: 1 }, (c) =>
      occupied.has(key(c)),
    ).map(key);
    expect(got).toEqual(['1:0', '5:1']);
  });
});

describe('stepCell', () => {
  it('moves within the column vertically', () => {
    expect(stepCell(COLUMNS, 10, { t: 2, s: 4 }, 'down')).toEqual({ t: 2, s: 5 });
    expect(stepCell(COLUMNS, 10, { t: 2, s: 4 }, 'up')).toEqual({ t: 2, s: 3 });
  });

  it('clamps at the first and last scene', () => {
    expect(stepCell(COLUMNS, 10, { t: 2, s: 0 }, 'up')).toEqual({ t: 2, s: 0 });
    expect(stepCell(COLUMNS, 10, { t: 2, s: 9 }, 'down')).toEqual({ t: 2, s: 9 });
  });

  it('steps over collapsed tracks horizontally', () => {
    // 2 → 5, not 2 → 3.
    expect(stepCell(COLUMNS, 10, { t: 2, s: 1 }, 'right')).toEqual({ t: 5, s: 1 });
    expect(stepCell(COLUMNS, 10, { t: 5, s: 1 }, 'left')).toEqual({ t: 2, s: 1 });
  });

  it('stays put at the horizontal edges', () => {
    expect(stepCell(COLUMNS, 10, { t: 1, s: 1 }, 'left')).toEqual({ t: 1, s: 1 });
    expect(stepCell(COLUMNS, 10, { t: 5, s: 1 }, 'right')).toEqual({ t: 5, s: 1 });
  });

  it('rescues a cursor stranded on a now-hidden track', () => {
    expect(stepCell(COLUMNS, 10, { t: 3, s: 2 }, 'left')).toEqual({ t: 1, s: 2 });
    expect(stepCell(COLUMNS, 10, { t: 3, s: 2 }, 'right')).toEqual({ t: 5, s: 2 });
  });

  it('does not move horizontally when there are no columns', () => {
    expect(stepCell([], 10, { t: 1, s: 2 }, 'right')).toEqual({ t: 1, s: 2 });
  });
});

describe('moveActive', () => {
  it('crosses from the first track column into the scene column', () => {
    expect(moveActive(COLUMNS, 10, { on: 'clip', t: 1, s: 3 }, 'left')).toEqual({
      on: 'scene',
      s: 3,
    });
  });

  it('crosses back out of the scene column into the first track', () => {
    expect(moveActive(COLUMNS, 10, { on: 'scene', s: 3 }, 'right')).toEqual({
      on: 'clip',
      t: 1,
      s: 3,
    });
  });

  it('does not leave the scene column to the left', () => {
    const at: ReturnType<typeof moveActive> = { on: 'scene', s: 3 };
    expect(moveActive(COLUMNS, 10, at, 'left')).toEqual(at);
  });

  it('walks scenes vertically in the scene column', () => {
    expect(moveActive(COLUMNS, 10, { on: 'scene', s: 3 }, 'down')).toEqual({ on: 'scene', s: 4 });
    expect(moveActive(COLUMNS, 10, { on: 'scene', s: 0 }, 'up')).toEqual({ on: 'scene', s: 0 });
    expect(moveActive(COLUMNS, 10, { on: 'scene', s: 9 }, 'down')).toEqual({ on: 'scene', s: 9 });
  });

  it('steps over collapsed tracks without touching the scene column', () => {
    expect(moveActive(COLUMNS, 10, { on: 'clip', t: 2, s: 1 }, 'right')).toEqual({
      on: 'clip',
      t: 5,
      s: 1,
    });
    expect(moveActive(COLUMNS, 10, { on: 'clip', t: 5, s: 1 }, 'left')).toEqual({
      on: 'clip',
      t: 2,
      s: 1,
    });
  });

  it('stays in the track columns at the right edge', () => {
    expect(moveActive(COLUMNS, 10, { on: 'clip', t: 5, s: 1 }, 'right')).toEqual({
      on: 'clip',
      t: 5,
      s: 1,
    });
  });

  it('clamps a scene index past the end of a shorter set', () => {
    expect(moveActive(COLUMNS, 2, { on: 'scene', s: 7 }, 'right')).toEqual({
      on: 'clip',
      t: 1,
      s: 1,
    });
  });

  it('has nowhere to go right from the scene column with every group collapsed', () => {
    const at: ReturnType<typeof moveActive> = { on: 'scene', s: 1 };
    expect(moveActive([], 10, at, 'right')).toEqual(at);
  });
});
