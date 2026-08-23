import { describe, expect, it } from 'vitest';
import {
  planSceneMove,
  planSceneReorder,
  describeMove,
  type MoveRequest,
} from './sceneMove.ts';

/** A set with no clips and no groups — enough to test the index arithmetic. */
function req(over: Partial<MoveRequest> = {}): MoveRequest {
  return {
    sceneCount: 10,
    sources: [0],
    dest: 0,
    clips: [],
    tracks: [{ i: 0, isGroup: false }],
    ...over,
  };
}

/**
 * Replay a plan against a model of the set and return the resulting scene order,
 * where each element is the original index (or `null` for a scene the plan
 * created but never filled).
 *
 * This is the test that matters. Asserting the plan's *fields* only proves it
 * matches whatever the implementation happens to produce; replaying it proves
 * the set ends up in the right order — which is the thing that can't be undone
 * if it's wrong.
 */
function replay(plan: ReturnType<typeof planSceneMove>, sceneCount: number) {
  if (!plan) throw new Error('expected a plan');
  const set: Array<number | null> = Array.from({ length: sceneCount }, (_, i) => i);
  for (const at of plan.create) set.splice(at, 0, null);
  // Copies read the source and write the blank; both indexes are post-insert.
  const copied = plan.steps.map((s) => ({ to: s.to, value: set[s.from] }));
  for (const { to, value } of copied) set[to] = value;
  for (const at of plan.remove) set.splice(at, 1);
  return set;
}

describe('planSceneMove', () => {
  it('returns null when the scenes are already there', () => {
    // Dropping a block back onto its own position, and onto the gap just below
    // it — both are the same set, and both are how a drag usually ends.
    expect(planSceneMove(req({ sources: [3, 4, 5], dest: 3 }))).toBeNull();
    expect(planSceneMove(req({ sources: [3, 4, 5], dest: 6 }))).toBeNull();
  });

  it('returns null for an empty or out-of-range selection', () => {
    expect(planSceneMove(req({ sources: [] }))).toBeNull();
    expect(planSceneMove(req({ sources: [99] }))).toBeNull();
  });

  it('moves a block upward and leaves the set in the right order', () => {
    const plan = planSceneMove(req({ sources: [5, 6, 7], dest: 2 }));
    expect(replay(plan, 10)).toEqual([0, 1, 5, 6, 7, 2, 3, 4, 8, 9]);
    expect(plan!.finalFrom).toBe(2);
    expect(plan!.finalTo).toBe(4);
  });

  it('moves a block downward and leaves the set in the right order', () => {
    const plan = planSceneMove(req({ sources: [1, 2], dest: 7 }));
    expect(replay(plan, 10)).toEqual([0, 3, 4, 5, 6, 1, 2, 7, 8, 9]);
    // The destination gap counted original scenes, five of which are still
    // above the block once the sources are lifted out.
    expect(plan!.finalFrom).toBe(5);
    expect(plan!.finalTo).toBe(6);
  });

  it('moves to the very top and the very bottom', () => {
    expect(replay(planSceneMove(req({ sources: [8, 9], dest: 0 })), 10))
      .toEqual([8, 9, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(replay(planSceneMove(req({ sources: [0, 1], dest: 10 })), 10))
      .toEqual([2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
  });

  it('gathers a song that sits in two blocks', () => {
    // A song is a label rather than a range, so its scenes can come in several
    // runs. Moving it collects them, which is a real change to the set and has
    // to come out in the right order rather than interleaved.
    const plan = planSceneMove(req({ sources: [1, 2, 7], dest: 5 }));
    expect(replay(plan, 10)).toEqual([0, 3, 4, 1, 2, 7, 5, 6, 8, 9]);
  });

  it('deletes descending, so earlier deletions cannot renumber later ones', () => {
    const plan = planSceneMove(req({ sources: [1, 2, 3], dest: 8 }))!;
    expect(plan.remove).toEqual([...plan.remove].sort((a, b) => b - a));
  });

  it('shifts source indexes past the inserted blanks', () => {
    // Sources below the destination keep their index; sources at or after it
    // move down by the number of blanks inserted above them.
    const plan = planSceneMove(req({ sources: [1, 8], dest: 4 }))!;
    expect(plan.create).toEqual([4, 5]);
    expect(plan.steps.map((s) => s.from)).toEqual([1, 10]);
    expect(plan.steps.map((s) => s.to)).toEqual([4, 5]);
  });

  it('lists only tracks that hold a clip', () => {
    const plan = planSceneMove(
      req({
        sources: [2, 3],
        dest: 0,
        tracks: [0, 1, 2].map((i) => ({ i, isGroup: false })),
        clips: [
          { t: 0, s: 2 },
          { t: 2, s: 2 },
          { t: 1, s: 9 }, // a different scene — not part of this move
        ],
      }),
    )!;
    expect(plan.steps[0].tracks).toEqual([0, 2]);
    expect(plan.steps[1].tracks).toEqual([]);
    expect(plan.clips).toBe(2);
  });

  it('never lists a group track', () => {
    // `duplicate_clip_to` raises on a group slot, and a raise mid-plan would
    // leave the set half-moved with the originals already gone.
    const plan = planSceneMove(
      req({
        sources: [4],
        dest: 0,
        tracks: [
          { i: 0, isGroup: true },
          { i: 1, isGroup: false },
        ],
        clips: [
          { t: 0, s: 4 },
          { t: 1, s: 4 },
        ],
      }),
    )!;
    expect(plan.steps[0].tracks).toEqual([1]);
    expect(plan.clips).toBe(1);
  });

  it('creates exactly as many blanks as it deletes', () => {
    // The set must be the same size afterwards. A mismatch is the signature of
    // the arithmetic being wrong in a way that loses or duplicates scenes.
    for (const [sources, dest] of [
      [[0], 5], [[9], 0], [[2, 3, 4], 9], [[1, 5, 8], 3], [[0, 1], 10],
    ] as Array<[number[], number]>) {
      const plan = planSceneMove(req({ sources, dest }))!;
      expect(plan.create).toHaveLength(plan.remove.length);
      expect(replay(plan, 10)).toHaveLength(10);
    }
  });

  it('preserves every scene exactly once, over every position', () => {
    // Exhaustive over a small set: whatever we move and wherever we drop it, the
    // result has to be a permutation. Nothing lost, nothing duplicated, no null
    // left behind from a blank that never got filled.
    const sceneCount = 7;
    for (let from = 0; from < sceneCount; from++) {
      for (let len = 1; len + from <= sceneCount; len++) {
        const sources = Array.from({ length: len }, (_, k) => from + k);
        for (let dest = 0; dest <= sceneCount; dest++) {
          const plan = planSceneMove(req({ sceneCount, sources, dest }));
          if (!plan) continue;
          const out = replay(plan, sceneCount);
          expect(out).toHaveLength(sceneCount);
          expect([...out].sort((a, b) => (a as number) - (b as number)))
            .toEqual(Array.from({ length: sceneCount }, (_, i) => i));
          // And the moved run landed where the plan promised.
          expect(out.slice(plan.finalFrom, plan.finalTo + 1)).toEqual(sources);
        }
      }
    }
  });
});

/** Every permutation of `0 … n-1`, for the exhaustive replays below. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) {
    for (let i = 0; i <= rest.length; i++) {
      out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
    }
  }
  return out;
}

describe('planSceneReorder', () => {
  const order = (order: number[], over: Partial<{ clips: MoveClip[]; tracks: MoveTrack[] }> = {}) =>
    planSceneReorder({ order, clips: [], tracks: [{ i: 0, isGroup: false }], ...over });

  type MoveClip = { t: number; s: number };
  type MoveTrack = { i: number; isGroup: boolean };

  it('returns null when the set is already in that order', () => {
    // Opening the modal and applying without dragging anything must not delete
    // and rebuild the set to put it back exactly as it was.
    expect(order([0, 1, 2, 3, 4])).toBeNull();
    expect(order([])).toBeNull();
  });

  it('refuses an order that is not the whole set', () => {
    // A short, repeated or out-of-range order would build a plan that deletes
    // scenes it never copied. Loud, because it can only be our own bug.
    expect(() => order([0, 1, 1])).toThrow(/exactly once/);
    expect(() => order([0, 1, 5])).toThrow(/exactly once/);
    expect(() => planSceneReorder({ order: [0, 1, 2.5], clips: [], tracks: [] })).toThrow();
  });

  it('replays to exactly the order asked for', () => {
    const wanted = [4, 0, 1, 2, 3];
    expect(replay(order(wanted), 5)).toEqual(wanted);
    expect(replay(order([2, 3, 4, 0, 1]), 5)).toEqual([2, 3, 4, 0, 1]);
  });

  it('reaches every order, over every permutation of a small set', () => {
    // The exhaustive replay is the whole proof: for each of the 873 orders of a
    // set of up to six scenes, the plan has to land on that order exactly —
    // nothing lost, nothing duplicated, no blank left unfilled.
    for (let n = 1; n <= 6; n++) {
      for (const wanted of permutations(n)) {
        const plan = order(wanted);
        if (!plan) {
          expect(wanted).toEqual(wanted.map((_, i) => i));
          continue;
        }
        expect(replay(plan, n)).toEqual(wanted);
        expect(plan.create).toHaveLength(plan.remove.length);
        expect(plan.remove).toEqual([...plan.remove].sort((a, b) => b - a));
      }
    }
  });

  it('moves only the scenes that have to move', () => {
    // One song lifted out of a set is one song's worth of copying, not the
    // set's. Everything between its old and new home is already in the right
    // order relative to everything else, so it stays where it is.
    const plan = order([0, 1, 3, 4, 5, 6, 7, 2, 8, 9])!;
    expect(plan.scenes).toBe(1);
    expect(plan.steps.map((s) => s.from)).toHaveLength(1);
  });

  it('gathers a song that sits in two runs', () => {
    // Two runs of one song, brought together: 5 joins 1 and 2. The scenes it
    // passes are in the right order already and are left alone.
    const plan = order([0, 1, 2, 5, 3, 4, 6])!;
    expect(replay(plan, 7)).toEqual([0, 1, 2, 5, 3, 4, 6]);
    expect(plan.scenes).toBe(1);
  });

  it('counts the clips it will copy, and never a group track', () => {
    const plan = order([2, 0, 1], {
      tracks: [
        { i: 0, isGroup: true },
        { i: 1, isGroup: false },
        { i: 2, isGroup: false },
      ],
      clips: [
        { t: 0, s: 2 }, // a group slot — duplicate_clip_to raises on one
        { t: 1, s: 2 },
        { t: 2, s: 2 },
        { t: 1, s: 0 }, // on a scene that isn't moving
      ],
    })!;
    expect(plan.steps[0]!.tracks).toEqual([1, 2]);
    expect(plan.clips).toBe(2);
    expect(describeMove(plan)).toBe('1 scene · 2 clips copied · 1 deleted');
  });

  it('creates its blanks in ascending order, so none renumbers another', () => {
    // The destination of every copy is stated as a plain index up front, which
    // is only true while each create_scene lands above the blanks already made.
    for (const wanted of permutations(6)) {
      const plan = order(wanted);
      if (!plan) continue;
      expect(plan.create).toEqual([...plan.create].sort((a, b) => a - b));
      expect(new Set(plan.create).size).toBe(plan.create.length);
    }
  });
});

describe('describeMove', () => {
  it('counts what will actually happen', () => {
    const plan = planSceneMove(
      req({
        sources: [2, 3],
        dest: 8,
        tracks: [{ i: 0, isGroup: false }],
        clips: [{ t: 0, s: 2 }, { t: 0, s: 3 }],
      }),
    )!;
    expect(describeMove(plan)).toBe('2 scenes · 2 clips copied · 2 deleted');
  });

  it('says "1 scene", not "1 scenes"', () => {
    const plan = planSceneMove(req({ sources: [0], dest: 5 }))!;
    expect(describeMove(plan)).toBe('1 scene · 0 clips copied · 1 deleted');
  });
});
