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

/** The clip fields the planner reads. Structurally typed over `BSV.Clip`. */
export interface MoveClipInput {
  t: number;
  s: number;
}

/** The track fields the planner reads. Structurally typed over `BSV.Track`. */
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

  const groups = new Set(tracks.filter((t) => t.isGroup).map((t) => t.i));

  // Occupied slots per scene. Built once — a `.find()` per (scene, track) is the
  // O(n²) that locks the tab up on a real set.
  const occupied = new Map<number, number[]>();
  for (const c of clips) {
    if (!isSource.has(c.s)) continue;
    // A group track's slots are aggregates of the tracks inside it, and
    // `duplicate_clip_to` raises on one. They shouldn't be in the snapshot at
    // all, so this is a guard rather than a filter — but it's the cheap kind.
    if (groups.has(c.t)) continue;
    const list = occupied.get(c.s);
    if (list) list.push(c.t);
    else occupied.set(c.s, [c.t]);
  }

  let clipCount = 0;
  const steps: SceneMoveStep[] = sources.map((s, k) => {
    const trackList = (occupied.get(s) ?? []).sort((a, b) => a - b);
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
