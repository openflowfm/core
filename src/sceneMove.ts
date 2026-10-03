// Moving a run of scenes to somewhere else in the set.
//
// The LOM has no scene-move call — verified against both Cycling '74's reference
// and Live 12.4.3's own docstring table, see `bridge/LOM.md`. What it has is
// `create_scene(index)`, `ClipSlot.duplicate_clip_to(slot)` and
// `delete_scene(index)`, so a move is build-then-delete:
//
//   1. create n blank scenes at the destination
//   2. copy every occupied slot across, column by column
//   3. carry the scene's own properties across
//   4. delete the originals
//
// **All the danger is in step 4**, and all the arithmetic that makes step 4 safe
// is in here, which is why this is a pure function with tests rather than a loop
// inside `lom.ts`. Step 1 renumbers the whole set underneath us: every original
// index at or after the destination shifts up by n, so the scenes we delete are
// not at the indexes we found them at. Getting that wrong deletes the wrong
// scenes, and no snapshot can put them back.
//
// This module knows nothing about *which* properties a scene has. That's
// deliberate: `lom.ts` reads them off the source object at move time, so the move
// carries fields the snapshot doesn't model (time signature) and can't be caught
// out by a stale snapshot. Here we only say which scene to copy from and to.

/** One moved scene: where to read it from, and the blank it lands in. */
export interface SceneMoveStep {
  /** Index of the original scene, **after** the blanks have been inserted. */
  from: number;
  /** Index of the blank it copies into. Also post-insert. */
  to: number;
  /**
   * Tracks holding a clip at `from` — the only slots worth a call.
   * `duplicate_clip_to` raises on an empty source, so an unfiltered sweep over
   * every track would throw on the first empty slot rather than skip it.
   */
  tracks: number[];
}

export interface SceneMovePlan {
  /** Blank scenes to create, ascending. `create_scene` takes each index. */
  create: number[];
  /** One per moved scene, in destination order. */
  steps: SceneMoveStep[];
  /**
   * Post-insert indexes to delete, **descending**. Descending because each
   * deletion renumbers everything below it; taking the highest first means the
   * ones still to come keep the indexes they were computed with.
   */
  remove: number[];
  /** Where the moved run ends up once the whole plan has run. */
  finalFrom: number;
  finalTo: number;
  /** How many scenes moved, and how many clip copies that is. */
  scenes: number;
  clips: number;
}

/** The clip fields the planner reads. Structurally typed over `OpenFlow.Clip`. */
export interface MoveClipInput {
  t: number;
  s: number;
}

/** The track fields the planner reads. Structurally typed over `OpenFlow.Track`. */
export interface MoveTrackInput {
  i: number;
  isGroup: boolean;
}

export interface MoveRequest {
  sceneCount: number;
  /** Scene indexes to move. Any set — they need not be contiguous. */
  sources: readonly number[];
  /**
   * Where they land, as a **gap** in the original numbering: `0` is above the
   * first scene, `sceneCount` is below the last. A gap rather than a scene index
   * because "between these two rows" is what a drop actually means, and it's the
   * only form that can address the end of the set.
   */
  dest: number;
  clips: readonly MoveClipInput[];
  tracks: readonly MoveTrackInput[];
}

/**
 * Which tracks hold a clip in each of `wanted`, ascending.
 *
 * Built once per plan rather than searched per (scene, track): a full set is
 * thousands of clips and a `.find()` per slot is the O(n²) that locks the tab up.
 *
 * Group tracks are dropped. `duplicate_clip_to` raises on a group slot, and a
 * raise mid-plan leaves the set half-moved — with the originals already deleted
 * if it happened late enough. They shouldn't reach a snapshot at all, so this is
 * a guard rather than a filter, but it's the cheap kind.
 */
function occupiedByScene(
  clips: readonly MoveClipInput[],
  tracks: readonly MoveTrackInput[],
  wanted: ReadonlySet<number>,
): Map<number, number[]> {
  const groups = new Set(tracks.filter((t) => t.isGroup).map((t) => t.i));
  const occupied = new Map<number, number[]>();
  for (const c of clips) {
    if (!wanted.has(c.s) || groups.has(c.t)) continue;
    const list = occupied.get(c.s);
    if (list) list.push(c.t);
    else occupied.set(c.s, [c.t]);
  }
  for (const list of occupied.values()) list.sort((a, b) => a - b);
  return occupied;
}

/**
 * The plan, or `null` when there's nothing to do.
 *
 * `null` for a move that wouldn't reorder anything — dropping a song back where
 * it already is, which is the overwhelmingly common way a drag ends. That has to
 * be *nothing*, not a no-op batch: this plan deletes scenes, and the cheapest way
 * to never delete a scene by accident is to not run when the answer is "it's
 * already there".
 */
export function planSceneMove(req: MoveRequest): SceneMovePlan | null {
  const { sceneCount, clips, tracks } = req;

  const sources = [...new Set(req.sources)]
    .filter((s) => Number.isInteger(s) && s >= 0 && s < sceneCount)
    .sort((a, b) => a - b);
  if (sources.length === 0) return null;

  const dest = Math.max(0, Math.min(sceneCount, Math.trunc(req.dest)));
  const n = sources.length;
  const isSource = new Set(sources);

  // Does this reorder anything? Build the order the move would produce and
  // compare. Cheaper to reason about than a pile of interval cases, and it gets
  // the non-contiguous selection right for free.
  const rest: number[] = [];
  for (let i = 0; i < sceneCount; i++) if (!isSource.has(i)) rest.push(i);
  const before = rest.filter((i) => i < dest);
  const after = rest.filter((i) => i >= dest);
  const result = [...before, ...sources, ...after];
  if (result.every((v, i) => v === i)) return null;

  // Step 1 renumbers the set: inserting n blanks at `dest` pushes everything
  // from `dest` down by n. Everything below is in post-insert indexes.
  const shift = (i: number) => i + (i >= dest ? n : 0);

  const create: number[] = [];
  for (let k = 0; k < n; k++) create.push(dest + k);

  const occupied = occupiedByScene(clips, tracks, isSource);

  let clipCount = 0;
  const steps: SceneMoveStep[] = sources.map((s, k) => {
    const trackList = occupied.get(s) ?? [];
    clipCount += trackList.length;
    return { from: shift(s), to: dest + k, tracks: trackList };
  });

  const remove = sources.map(shift).sort((a, b) => b - a);

  return {
    create,
    steps,
    remove,
    finalFrom: before.length,
    finalTo: before.length + n - 1,
    scenes: n,
    clips: clipCount,
  };
}

export interface ReorderRequest {
  /**
   * Every scene of the set, in the order they should end up — a permutation of
   * `0 … n-1`. The whole set rather than a selection, because a reorder is
   * stated as a destination *order* and not as a series of moves; anything the
   * caller left alone appears at the position it already has.
   */
  order: readonly number[];
  clips: readonly MoveClipInput[];
  tracks: readonly MoveTrackInput[];
}

/**
 * Positions of a longest strictly increasing subsequence of `values`.
 *
 * Patience sorting, O(n log n) — a hundred songs is nothing, but this runs in a
 * render while the modal is open and a quadratic version would be felt.
 *
 * `tails[l]` holds the position of the smallest tail among the increasing runs
 * of length `l+1`, and `prev` remembers what each position extended, which is
 * what makes the subsequence itself recoverable rather than just its length.
 */
function longestIncreasing(values: readonly number[]): number[] {
  const prev = new Array<number>(values.length).fill(-1);
  const tails: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let i = tails.length === 0 ? -1 : tails[tails.length - 1]!; i >= 0; i = prev[i]!) {
    out.push(i);
  }
  return out.reverse();
}

/**
 * Put the whole set into a given order, as **one** plan.
 *
 * The counterpart to `planSceneMove`: that one answers "take this run and drop
 * it there", this one answers "here is the order I want". Reordering a set a
 * song at a time is what the modal exists to avoid — every drag in the grid is
 * its own create/copy/delete pass and its own re-snapshot, and the waiting is
 * what stops anyone trying an order out.
 *
 * **Only the scenes that have to move, move.** The longest increasing
 * subsequence of `order` is the largest set of scenes already in the right
 * relative order, so those stay exactly where they are and everything else is
 * rebuilt around them. Reordering one song out of a hundred therefore costs what
 * dragging it costs, not what rewriting the set costs — which is the whole
 * reason this isn't "copy all n scenes to the end and delete the originals",
 * which would be four lines and correct and would copy every clip in the set.
 *
 * The blanks are still one contiguous group per gap, and they're emitted in
 * ascending position, so each `create_scene` lands above every blank already
 * made and none of them renumber each other. That's what lets the destination
 * of a copy be stated as a plain index up front.
 *
 * Throws when `order` isn't a permutation of the set. That's a caller bug rather
 * than a user action — and a plan built from a half-correct order would delete
 * scenes it never copied.
 */
export function planSceneReorder(req: ReorderRequest): SceneMovePlan | null {
  const { order, clips, tracks } = req;
  const n = order.length;

  const seen = new Set<number>();
  for (const s of order) {
    if (!Number.isInteger(s) || s < 0 || s >= n || seen.has(s)) {
      throw new Error(
        `planSceneReorder: order must list each of the ${n} scenes exactly once`,
      );
    }
    seen.add(s);
  }
  if (n === 0 || order.every((s, i) => s === i)) return null;

  const { create, steps, remove, moved, clips: clipCount } = rebuild(n, order, clips, tracks);

  // A reorder's moved scenes are scattered, so unlike a move there's no single
  // run to point at. These bound the span that changed — the first and last
  // final position holding a scene that wasn't there before. Through a map
  // rather than `indexOf` per scene, which is the same O(n²) that `occupied`
  // exists to avoid.
  const finalAt = new Map(order.map((s, i) => [s, i]));
  const finals = moved.map((s) => finalAt.get(s)!);

  return {
    create,
    steps,
    remove,
    finalFrom: Math.min(...finals),
    finalTo: Math.max(...finals),
    scenes: moved.length,
    clips: clipCount,
  };
}

/**
 * The arithmetic shared by `planSceneReorder` and `planSceneKeep`: rebuild the
 * set so the scenes in `order` stand in that order, and delete every original
 * that isn't left standing. `order` is already validated — distinct, in range —
 * and may cover the whole set (a reorder) or part of it (a keep).
 *
 * The scenes of `order`'s longest increasing subsequence are the **anchors**:
 * already in the right relative order, they stay exactly where they are. Every
 * other kept scene is copied into a blank, and every scene not in `order` is
 * simply in `remove`, never copied.
 */
function rebuild(
  sceneCount: number,
  order: readonly number[],
  clips: readonly MoveClipInput[],
  tracks: readonly MoveTrackInput[],
): {
  create: number[];
  steps: SceneMoveStep[];
  remove: number[];
  /** Kept scenes that are copied, in wanted order. */
  moved: number[];
  clips: number;
} {
  const anchors = new Set(longestIncreasing(order).map((p) => order[p]!));

  // One walk down the wanted order. `base` is the pre-insert index the next
  // blank belongs at — directly after the last anchor passed, so that once the
  // originals are deleted the blank sits between that anchor and the next.
  // Anchors are met in ascending index order, so `base` never goes backwards and
  // every blank index is larger than the last. Scenes that aren't kept don't
  // enter into it: they're deleted, so whichever side of a blank they sit on
  // makes no difference to the order that's left.
  const create: number[] = [];
  const moved: Array<{ s: number; blank: number }> = [];
  let base = 0;
  for (const s of order) {
    if (anchors.has(s)) {
      base = s + 1;
      continue;
    }
    const blank = base + create.length;
    create.push(blank);
    moved.push({ s, blank });
  }

  // Where each original scene ends up once the blanks exist. Computed by
  // merging rather than by arithmetic: the blanks' final indexes *are* their
  // create indexes (each is above all the ones before it), so the originals fill
  // the positions left over, in order.
  const isBlank = new Set(create);
  const post = new Map<number, number>();
  for (let p = 0, s = 0; p < sceneCount + create.length; p++) {
    if (!isBlank.has(p)) post.set(s++, p);
  }

  const occupied = occupiedByScene(clips, tracks, new Set(moved.map((m) => m.s)));

  let clipCount = 0;
  const steps: SceneMoveStep[] = moved.map(({ s, blank }) => {
    const trackList = occupied.get(s) ?? [];
    clipCount += trackList.length;
    return { from: post.get(s)!, to: blank, tracks: trackList };
  });

  // Every original except the anchors goes: the moved scenes' originals, now
  // copied, and the scenes that weren't kept at all. Built from `post`, so a
  // created blank can never be named here.
  const remove: number[] = [];
  for (let s = 0; s < sceneCount; s++) if (!anchors.has(s)) remove.push(post.get(s)!);
  remove.sort((a, b) => b - a);

  return { create, steps, remove, moved: moved.map((m) => m.s), clips: clipCount };
}

/**
 * What the move costs, for the UI to say out loud before it runs.
 *
 * Separate from the plan because it's shown at *hover* time, over every candidate
 * drop position, while the plan is only built on drop.
 */
export function describeMove(plan: SceneMovePlan): string {
  const scenes = `${plan.scenes} scene${plan.scenes === 1 ? '' : 's'}`;
  const clips = `${plan.clips} clip${plan.clips === 1 ? '' : 's'}`;
  return `${scenes} · ${clips} copied · ${plan.scenes} deleted`;
}

export interface KeepRequest {
  /** Scenes in the set the plan is built against. */
  sceneCount: number;
  /**
   * The scenes to keep, in the order they should end up. Distinct, each in
   * `0 … sceneCount-1`, and not empty. Every scene not listed is deleted.
   */
  order: readonly number[];
  clips: readonly MoveClipInput[];
  tracks: readonly MoveTrackInput[];
}

/**
 * A running order put in place with everything else deleted. `sceneCount`,
 * `create`, `steps` and `remove` are the wire `OpenFlow.KeepPlan`; the client
 * adds `sceneNames` from its snapshot before sending. The rest are for the UI.
 */
export interface SceneKeepPlan {
  sceneCount: number;
  /** Blank scenes to create, ascending. */
  create: number[];
  steps: SceneMoveStep[];
  /**
   * Post-insert indexes to delete, **descending**: the original of every moved
   * scene, and every scene not kept. Dropped scenes are never copied.
   */
  remove: number[];
  /** UI only: scenes left once the plan has run — `order.length`. */
  keep: number;
  /** Kept scenes that had to be copied to reach their place. */
  moved: number;
  /** Scenes deleted without being copied. */
  dropped: number;
  /** Clip copies the moved scenes cost. */
  clips: number;
}

/**
 * Put the scenes in `order` in that order and delete every other scene, as
 * **one** plan — the generalisation of `planSceneReorder` to an order that
 * covers only part of the set.
 *
 * `null` when there is nothing to do: `order` is the whole set, already in
 * place. Throws on an `order` that is empty, repeats a scene or names one out
 * of range — a caller bug, and a plan built from it would delete the wrong
 * scenes.
 *
 * A returned plan guarantees what the bridge checks before running it:
 * - `create` is strictly ascending.
 * - `remove` is unique, strictly descending, and each index is in
 *   `0 … sceneCount + create.length - 1`.
 * - Every `steps[].to` is a created blank, and no `remove` index is a created
 *   blank.
 * - Every `steps[].from` is in `remove`.
 * - `sceneCount + create.length - remove.length >= 1` (and equals `keep`).
 *
 * The bridge's last check, that `sceneNames` matches Live, is the client's to
 * satisfy: it sends the names from the snapshot the plan was built against.
 */
export function planSceneKeep(req: KeepRequest): SceneKeepPlan | null {
  const { sceneCount, order, clips, tracks } = req;

  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new Error(`planSceneKeep: sceneCount must be a positive integer, got ${sceneCount}`);
  }
  if (order.length === 0) {
    throw new Error('planSceneKeep: order must keep at least one scene');
  }
  const seen = new Set<number>();
  for (const s of order) {
    if (!Number.isInteger(s) || s < 0 || s >= sceneCount || seen.has(s)) {
      throw new Error(
        `planSceneKeep: order must list distinct scenes of the ${sceneCount}, got ${s}`,
      );
    }
    seen.add(s);
  }
  if (order.length === sceneCount && order.every((s, i) => s === i)) return null;

  const plan = rebuild(sceneCount, order, clips, tracks);
  return {
    sceneCount,
    create: plan.create,
    steps: plan.steps,
    remove: plan.remove,
    keep: order.length,
    moved: plan.moved.length,
    dropped: sceneCount - order.length,
    clips: plan.clips,
  };
}

/**
 * What a keep plan costs, for the UI to say before it runs — read like
 * `describeMove`. "Deleted" counts the scenes that are gone afterwards, not the
 * moved scenes' originals: those are deleted too, but the user sees them move.
 */
export function describeKeep(plan: SceneKeepPlan): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${n(plan.moved, 'scene')} moved · ${n(plan.clips, 'clip')} copied · ${n(plan.dropped, 'scene')} deleted`;
}
