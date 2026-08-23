import { describe, expect, it } from 'vitest';
import {
  chainKey,
  mergeChainWatches,
  sameChainWatches,
  validChainWatch,
  type ChainWatch,
} from './chainWatch.ts';

const w = (t: number, path: number[], open: number[]): ChainWatch => ({ t, path, open });

describe('chainKey', () => {
  it("separates a track's own run from a rack chain inside it", () => {
    expect(chainKey(w(3, [], []))).not.toBe(chainKey(w(3, [0], [])));
  });

  it('distinguishes nesting depth that shares a prefix', () => {
    expect(chainKey(w(1, [2], []))).not.toBe(chainKey(w(1, [2, 0], [])));
  });
});

describe('mergeChainWatches', () => {
  it('keeps both runs when two clients watch different tracks', () => {
    const merged = mergeChainWatches([[w(0, [], [1])], [w(4, [], [0])]]);
    expect(merged.map((m) => m.t)).toEqual([0, 4]);
  });

  it('unions open sets rather than letting one client narrow another', () => {
    const merged = mergeChainWatches([[w(2, [], [0, 1])], [w(2, [], [3])]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].open).toEqual([0, 1, 3]);
  });

  it('keeps a run whose open set is empty', () => {
    // A shell-only subscription is what notices a device added in Live.
    const merged = mergeChainWatches([[w(1, [], [])]]);
    expect(merged).toEqual([{ t: 1, path: [], open: [] }]);
  });

  it('drops a client entirely when it declares nothing', () => {
    const merged = mergeChainWatches([[w(1, [], [0])], []]);
    expect(merged).toEqual([{ t: 1, path: [], open: [0] }]);
  });

  it('is empty when every client has stopped looking', () => {
    expect(mergeChainWatches([[], []])).toEqual([]);
  });

  it("folds a client's own duplicate entries into one", () => {
    const merged = mergeChainWatches([[w(0, [], [1]), w(0, [], [2])]]);
    expect(merged).toEqual([{ t: 0, path: [], open: [1, 2] }]);
  });

  it('orders by track, then by path, then within open', () => {
    const merged = mergeChainWatches([
      [w(2, [1], [5, 0]), w(2, [], []), w(0, [], []), w(2, [0, 3], [])],
    ]);
    expect(merged.map((m) => [m.t, m.path])).toEqual([
      [0, []],
      [2, []],
      [2, [0, 3]],
      [2, [1]],
    ]);
    expect(merged[3].open).toEqual([0, 5]);
  });

  it('sorts a path prefix before the deeper path that extends it', () => {
    const merged = mergeChainWatches([[w(0, [1, 0], []), w(0, [1], [])]]);
    expect(merged.map((m) => m.path)).toEqual([[1], [1, 0]]);
  });

  it('produces an identical value however the clients are ordered', () => {
    const a = mergeChainWatches([[w(1, [], [2])], [w(0, [3], [1, 0])]]);
    const b = mergeChainWatches([[w(0, [3], [0, 1])], [w(1, [], [2])]]);
    expect(sameChainWatches(a, b)).toBe(true);
  });
});

describe('sameChainWatches', () => {
  it('sees an added open device', () => {
    expect(sameChainWatches([w(0, [], [1])], [w(0, [], [1, 2])])).toBe(false);
  });

  it('sees a run that went away', () => {
    expect(sameChainWatches([w(0, [], [])], [])).toBe(false);
  });

  it('separates the same indexes at different depths', () => {
    expect(sameChainWatches([w(0, [1], [])], [w(0, [1, 0], [])])).toBe(false);
  });
});

describe('validChainWatch', () => {
  it('accepts a shell-only subscription to a track run', () => {
    expect(validChainWatch({ t: 0, path: [], open: [] })).toBe(true);
  });

  it('accepts a run two racks deep', () => {
    expect(validChainWatch({ t: 4, path: [1, 0, 3, 2], open: [0] })).toBe(true);
  });

  it.each([
    ['a negative track', { t: -1, path: [], open: [] }],
    ['a fractional path entry', { t: 0, path: [0.5], open: [] }],
    ['a negative open index', { t: 0, path: [], open: [-2] }],
    ['an odd path, which names half an address', { t: 0, path: [2], open: [] }],
    ['a missing path', { t: 0, open: [] }],
    ['a path that is not a list', { t: 0, path: 3, open: [] }],
    ['nothing at all', null],
  ])('refuses %s', (_label, value) => {
    expect(validChainWatch(value)).toBe(false);
  });
});
