// Dragging clips to another place in the grid.
//
// A drag is a **rigid translation**: every clip picked up moves by the same
// (dt, ds), so the plan is fully described by the sources and one offset. That
// is what makes the ordering problem below solvable at all.
//
// Live has no move. `ClipSlot.duplicate_clip_to` copies and `delete_clip`
// removes, so a move is copy-then-delete — the same shape as reordering scenes,
// and with the same consequence: it is not atomic. A failure partway leaves
// clips copied and originals still there, which is the recoverable direction.
// Deletes therefore come last, all of them, after every copy has succeeded.

/** The track fields the planner reads. Structurally typed over `OpenFlow.Track`. */
export interface ClipMoveTrack {
  i: number;
  isGroup: boolean;
  isMidi: boolean;
}

/** A clip's address. Structurally typed over `OpenFlow.Clip`. */
export interface ClipAt {
  t: number;
  s: number;
}

export interface ClipMoveStep {
  fromT: number;
  fromS: number;
  toT: number;
  toS: number;
}

export interface ClipMovePlan {
  /**
   * The copies, **in the order they must run**. Not a set — see `orderSteps`.
   */
  steps: ClipMoveStep[];
  /**
   * Sources to clear afterwards: the ones nothing landed on. A source that is
   * also someone's target now holds the moved clip and must survive.
   */
  remove: ClipAt[];
  /**
   * Clips this destroys — occupied targets that weren't themselves picked up.
   * Live overwrites silently; the count is what lets the UI say so first.
   */
  overwrites: number;
  /** How many clips move. `steps.length`, named for the UI to talk about. */
  clips: number;
}

const key = (t: number, s: number) => `${t}:${s}`;

/**
 * Order the copies so that no clip is overwritten before it has been copied out.
 *
 * Moving a block one scene down, `(t,5) → (t,6)` and `(t,6) → (t,7)`, is wrong
 * in that order: writing 6 destroys the clip that step two was going to read.
 * Doing the far end first is right, and "far end" is decided by the direction
 * of travel — descending when the offset is positive, ascending when negative.
 *
 * A rigid translation is what makes one comparator enough. If a source sits on
 * another source's target, it is exactly one offset further along, so sorting
 * against the direction of travel always puts it first. The scene axis decides
 * whenever `ds` is non-zero, because then any collision differs in `s`; the
 * track axis only has to break ties when the drag is purely sideways.
 */
function orderSteps(steps: ClipMoveStep[], dt: number, ds: number): ClipMoveStep[] {
  const bySequence = (a: ClipMoveStep, b: ClipMoveStep) => {
    if (ds !== 0 && a.fromS !== b.fromS) {
      return ds > 0 ? b.fromS - a.fromS : a.fromS - b.fromS;
    }
    if (a.fromT !== b.fromT) return dt > 0 ? b.fromT - a.fromT : a.fromT - b.fromT;
    return a.fromS - b.fromS;
  };
  return [...steps].sort(bySequence);
}

/**
 * The set's clips as they read once the plan has run, so a drag doesn't have to
 * be followed by re-walking the set. The counterpart to `applyOps`, and it has
 * an easier job: a move touches no clip's fields, only which slot holds it.
 *
 * **Replays the steps in plan order against the result so far**, which is the
 * whole reason this isn't a one-line remap. `orderSteps` arranged them so that
 * a step reading a slot an earlier step wrote sees what Live will see, and
 * running them in any other order here would model a set Live never produces.
 * Then every delete, after every copy, exactly as `lom.ts` runs it.
 *
 * Sound only when the move fully succeeded — `lom.ts` skips the entire delete
 * pass if any copy failed, so a partial result is not this shape at all, and
 * the caller has to re-read rather than guess.
 *
 * Returned in track-then-scene order to match the walk's, so a locally-updated
 * set is indistinguishable from a freshly-read one.
 */
export function applyClipMove<T extends ClipAt>(
  clips: readonly T[],
  plan: { steps: readonly ClipMoveStep[]; remove: readonly ClipAt[] },
): T[] {
  const at = new Map<string, T>();
  for (const c of clips) at.set(key(c.t, c.s), c);

  for (const st of plan.steps) {
    const src = at.get(key(st.fromT, st.fromS));
    // A step with no clip under it means the plan was built against a set that
    // has since changed. Nothing to copy, and Live would have failed the same
    // way — which the caller's failure check catches before it ever gets here.
    if (!src) continue;
    at.set(key(st.toT, st.toS), { ...src, t: st.toT, s: st.toS });
  }
  for (const c of plan.remove) at.delete(key(c.t, c.s));

  return [...at.values()].sort((a, b) => (a.t === b.t ? a.s - b.s : a.t - b.t));
}

export interface ClipMoveRequest {
  /** The clips being dragged. Duplicates and empties are the caller's to avoid. */
  sources: readonly ClipAt[];
  /** The rigid offset, in tracks and scenes. */
  dt: number;
  ds: number;
  sceneCount: number;
  tracks: readonly ClipMoveTrack[];
  /** Every clip in the set — what says whether a target is already occupied. */
  clips: readonly ClipAt[];
}

/**
 * The plan, or `null` when the drag can't be performed at all.
 *
 * `null` rather than a partial plan, and that's the important decision. Live
 * raises on `duplicate_clip_to` for a group slot and for a type mismatch, and a
 * raise partway through leaves the set half-moved. Refusing whole is the only
 * answer that can't half-destroy something, so one bad target invalidates the
 * drop rather than being quietly dropped from it — the indicator doesn't draw,
 * and nothing runs.
 *
 * Refused: a zero offset, an empty source list, any target off the grid, any
 * target on a group track, and any target whose track is of the other type.
 * A MIDI clip cannot go to an audio track; that's Live's rule, not ours.
 */
export function planClipMove(req: ClipMoveRequest): ClipMovePlan | null {
  const { sources, dt, ds, sceneCount, tracks, clips } = req;
  if (sources.length === 0) return null;
  // Dropping a clip back where it started is the overwhelmingly common way a
  // drag ends. That has to be *nothing*, not a no-op batch that still deletes.
  if (dt === 0 && ds === 0) return null;

  const trackAt = new Map(tracks.map((t) => [t.i, t]));
  const sourceKeys = new Set(sources.map((c) => key(c.t, c.s)));
  const occupied = new Set(clips.map((c) => key(c.t, c.s)));

  const steps: ClipMoveStep[] = [];
  const targetKeys = new Set<string>();
  let overwrites = 0;

  for (const c of sources) {
    const toT = c.t + dt;
    const toS = c.s + ds;
    if (toS < 0 || toS >= sceneCount) return null;

    const from = trackAt.get(c.t);
    const to = trackAt.get(toT);
    if (from === undefined || to === undefined) return null;
    // A group track's slot holds no clip of its own; `duplicate_clip_to` raises
    // on one at either end. Neither end should be reachable from the grid — a
    // group column isn't selectable — so this is a guard, not a filter.
    if (from.isGroup || to.isGroup) return null;
    if (from.isMidi !== to.isMidi) return null;

    steps.push({ fromT: c.t, fromS: c.s, toT, toS });
    const k = key(toT, toS);
    targetKeys.add(k);
    // Something already there, and not something that is itself leaving.
    if (occupied.has(k) && !sourceKeys.has(k)) overwrites++;
  }

  // A source that something lands on keeps its new contents. Only the ones
  // nothing lands on get cleared.
  const remove = sources.filter((c) => !targetKeys.has(key(c.t, c.s)));

  return {
    steps: orderSteps(steps, dt, ds),
    remove,
    overwrites,
    clips: steps.length,
  };
}
