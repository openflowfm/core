import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_MS, shouldWalk, STALE_MS, type Staleness } from './backstop.ts';

const MINUTE = 60_000;

/** A set walked `age` ms ago, with the last attempt at the same moment. */
const aged = (age: number, over: Partial<Staleness> = {}): Staleness => ({
  now: 10 * MINUTE,
  lastSnapshotAt: 10 * MINUTE - age,
  lastAttemptAt: 10 * MINUTE - age,
  staleMs: STALE_MS,
  minIntervalMs: MIN_INTERVAL_MS,
  ...over,
});

describe('shouldWalk', () => {
  it('leaves a freshly walked set alone', () => {
    expect(shouldWalk(aged(MINUTE))).toBe(false);
  });

  it('walks a set older than staleMs', () => {
    expect(shouldWalk(aged(6 * MINUTE))).toBe(true);
  });

  it('treats exactly staleMs as stale', () => {
    expect(shouldWalk(aged(STALE_MS))).toBe(true);
    expect(shouldWalk(aged(STALE_MS - 1))).toBe(false);
  });

  it('does not walk when nothing has been walked yet', () => {
    // The once-per-session effect owns the first walk. Answering true here
    // would re-run it on every focus, which is an infinite retry of a walk
    // that just failed — the exact loop `autoWalkedRef` exists to prevent.
    expect(shouldWalk(aged(60 * MINUTE, { lastSnapshotAt: null, lastAttemptAt: null }))).toBe(
      false,
    );
  });

  it('absorbs the second event of an alt-tab burst', () => {
    // `focus` and `visibilitychange` both fire on one alt-tab. The first passes
    // and stamps the attempt; the second arrives in the same instant.
    const stale = aged(30 * MINUTE);
    expect(shouldWalk(stale)).toBe(true);
    expect(shouldWalk({ ...stale, lastAttemptAt: stale.now })).toBe(false);
  });

  it('retries a failed walk, but only after minIntervalMs', () => {
    // A walk that failed leaves the old snapshot in place and stale, so this
    // keeps saying yes. The floor is what makes that a slow retry, not a loop.
    const failing = { ...aged(30 * MINUTE), lastAttemptAt: 10 * MINUTE - 5_000 };
    expect(shouldWalk(failing)).toBe(false);
    expect(shouldWalk({ ...failing, lastAttemptAt: 10 * MINUTE - MIN_INTERVAL_MS })).toBe(true);
  });

  it('stays quiet on a set kept current by deltas', () => {
    // The caller must not stamp lastSnapshotAt from a delta. This is the shape
    // that proves why: were it stamped, a set under active editing would never
    // re-walk — and that's the set most likely to have drifted somewhere no
    // observer is watching.
    expect(shouldWalk(aged(MINUTE))).toBe(false);
    expect(shouldWalk(aged(6 * MINUTE))).toBe(true);
  });

  it('walks after the machine wakes from sleep', () => {
    // Date.now() jumps forward across a sleep, which is exactly right: the set
    // really is hours old and nothing was listening while the socket was down.
    expect(shouldWalk(aged(4 * 60 * MINUTE))).toBe(true);
  });

  it('does not walk if the clock went backwards', () => {
    // Rare, and the safe answer is "not stale" — a negative age can't mean the
    // set aged out, and walking on it would be a walk we can't justify.
    expect(shouldWalk({ ...aged(0), lastSnapshotAt: 11 * MINUTE })).toBe(false);
  });

  it('is not disabled by a null lastAttemptAt', () => {
    // Nothing has been tried yet this session, but a snapshot is held and old —
    // e.g. it arrived from the initial walk and the tab sat untouched.
    expect(shouldWalk(aged(6 * MINUTE, { lastAttemptAt: null }))).toBe(true);
  });
});
