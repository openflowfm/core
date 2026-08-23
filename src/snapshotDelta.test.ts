import { describe, expect, it } from 'vitest';
import { canApplyDelta, mergeRows, mergeTrackDelta } from './snapshotDelta.ts';

interface Clip {
  t: number;
  s: number;
  name: string;
}

const clip = (t: number, s: number, name = `${t}:${s}`): Clip => ({ t, s, name });

describe('mergeTrackDelta', () => {
  it('leaves clips outside the scope untouched', () => {
    const before = [clip(0, 0), clip(1, 0), clip(2, 0)];
    const after = mergeTrackDelta(before, [1], [clip(1, 0, 'renamed')]);
    expect(after).toEqual([clip(0, 0), clip(1, 0, 'renamed'), clip(2, 0)]);
  });

  it('drops a clip the re-read no longer reports — the upsert trap', () => {
    // The whole reason this isn't an upsert. Track 1 held a clip; Live says it
    // holds nothing now. An upsert keyed by (t, s) would find no incoming entry
    // to overwrite it and silently keep the stale one.
    const before = [clip(0, 0), clip(1, 5)];
    expect(mergeTrackDelta(before, [1], [])).toEqual([clip(0, 0)]);
  });

  it('moves a clip between two scoped tracks without duplicating it', () => {
    // The case the whole feature exists for: source and destination are both in
    // scope, so the clip leaves one track and appears in the other in one merge.
    const before = [clip(3, 7, 'VERSE'), clip(9, 0, 'other')];
    const after = mergeTrackDelta(before, [3, 4], [clip(4, 7, 'VERSE')]);
    expect(after).toEqual([clip(4, 7, 'VERSE'), clip(9, 0, 'other')]);
  });

  it('moves a clip between scenes within one scoped track', () => {
    const before = [clip(2, 1, 'A'), clip(2, 9, 'B')];
    const after = mergeTrackDelta(before, [2], [clip(2, 4, 'A'), clip(2, 9, 'B')]);
    expect(after).toEqual([clip(2, 4, 'A'), clip(2, 9, 'B')]);
  });

  it('represents an emptied track as a scope entry with no clips', () => {
    const before = [clip(0, 0), clip(0, 1), clip(1, 0)];
    expect(mergeTrackDelta(before, [0], [])).toEqual([clip(1, 0)]);
  });

  it('handles a clip overwritten at its destination', () => {
    // Dropping onto an occupied slot destroys what was there. Both tracks are
    // in scope, so the casualty disappears with everything else in the rewrite.
    const before = [clip(1, 0, 'moved'), clip(2, 0, 'casualty')];
    const after = mergeTrackDelta(before, [1, 2], [clip(2, 0, 'moved')]);
    expect(after).toEqual([clip(2, 0, 'moved')]);
  });

  it('drops incoming clips outside the declared scope', () => {
    // Nothing would ever replace them: a later delta only rewrites its own
    // scope, so an out-of-scope clip would be uncorrectable once admitted.
    const before = [clip(0, 0)];
    const after = mergeTrackDelta(before, [1], [clip(1, 0), clip(5, 0, 'stray')]);
    expect(after).toEqual([clip(0, 0), clip(1, 0)]);
  });

  it('is a no-op for an empty scope', () => {
    const before = [clip(0, 0), clip(1, 1)];
    expect(mergeTrackDelta(before, [], [])).toEqual(before);
  });

  it('orders the result by track then scene, as snapshot builds it', () => {
    const before = [clip(5, 2), clip(0, 9)];
    const after = mergeTrackDelta(before, [2], [clip(2, 3), clip(2, 0)]);
    expect(after.map((c) => `${c.t}:${c.s}`)).toEqual(['0:9', '2:0', '2:3', '5:2']);
  });

  it('does not mutate its inputs', () => {
    const before = [clip(0, 0), clip(1, 0)];
    const incoming = [clip(1, 1)];
    const frozenBefore = JSON.stringify(before);
    const frozenIncoming = JSON.stringify(incoming);
    mergeTrackDelta(before, [1], incoming);
    expect(JSON.stringify(before)).toBe(frozenBefore);
    expect(JSON.stringify(incoming)).toBe(frozenIncoming);
  });

  it('tolerates a scope entry that held nothing and still holds nothing', () => {
    const before = [clip(0, 0)];
    expect(mergeTrackDelta(before, [7], [])).toEqual([clip(0, 0)]);
  });
});

describe('canApplyDelta', () => {
  it('applies a delta computed against exactly what we hold', () => {
    expect(canApplyDelta(4, 4)).toBe(true);
  });

  it('refuses one computed against an older revision', () => {
    expect(canApplyDelta(6, 4)).toBe(false);
  });

  it('refuses one from the future — a missed message, not a retry', () => {
    expect(canApplyDelta(4, 6)).toBe(false);
  });
});

describe('mergeRows', () => {
  interface Scene {
    i: number;
    name: string;
  }
  const scene = (i: number, name = `s${i}`): Scene => ({ i, name });

  it('replaces the rows it names and leaves the rest', () => {
    const before = [scene(0), scene(1), scene(2)];
    expect(mergeRows(before, [scene(1, 'CHORUS')])).toEqual([
      scene(0),
      scene(1, 'CHORUS'),
      scene(2),
    ]);
  });

  it('keeps rows the delta says nothing about — the opposite of clip scope', () => {
    // The contrast that justifies two merge functions. A clip absent from a
    // scoped track is a deletion; a scene absent from a row payload is simply
    // one that wasn't re-read.
    const before = [scene(0), scene(1)];
    expect(mergeRows(before, [])).toEqual(before);
  });

  it('drops a row for an index the set does not have', () => {
    // Nothing later corrects it: a delta only rewrites what it names. A row
    // beyond the end means the sender is describing a different set.
    const before = [scene(0), scene(1)];
    expect(mergeRows(before, [scene(1, 'kept'), scene(9, 'stray')])).toEqual([
      scene(0),
      scene(1, 'kept'),
    ]);
  });

  it('applies several rows at once', () => {
    const before = [scene(0), scene(1), scene(2)];
    expect(mergeRows(before, [scene(2, 'C'), scene(0, 'A')])).toEqual([
      scene(0, 'A'),
      scene(1),
      scene(2, 'C'),
    ]);
  });

  it('preserves order regardless of the order rows arrive in', () => {
    const before = [scene(0), scene(1), scene(2)];
    const after = mergeRows(before, [scene(2, 'C'), scene(1, 'B')]);
    expect(after.map((r) => r.i)).toEqual([0, 1, 2]);
  });

  it('does not mutate its inputs', () => {
    const before = [scene(0), scene(1)];
    const incoming = [scene(1, 'new')];
    mergeRows(before, incoming);
    expect(before).toEqual([scene(0), scene(1)]);
    expect(incoming).toEqual([scene(1, 'new')]);
  });

  it('is a no-op on an empty held set', () => {
    expect(mergeRows([], [scene(0)])).toEqual([]);
  });
});
