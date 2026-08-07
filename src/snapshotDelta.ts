// Merging a partial re-read of the set into the snapshot already in hand.
//
// A full walk is tens of thousands of LOM reads. When Live's selection tells us
// which tracks the user has been working in, re-reading just those costs ~11ms
// a track against ~950ms for everything — but only if the result can be merged
// back correctly, and the obvious merge is wrong. See mergeTrackDelta.
//
// Structurally typed like ops.ts: this needs the address fields and nothing
// else, and keeping core free of the wire types is what lets it be tested with
// no transport around it.

export interface ClipAddress {
  t: number;
  s: number;
}

/**
 * Replace every clip in `scope` with `incoming`.
 *
 * **Scope-then-replace, never upsert by `(t, s)`** — and that distinction is
 * the whole reason this function exists rather than being three inline lines.
 *
 * An upsert carries over a clip that is no longer there. A deleted clip has no
 * entry in `incoming`, so nothing overwrites it and the stale copy survives.
 * Deletion is precisely what a re-read exists to catch: **a clip moved out of a
 * slot is a deletion at the source**, so a merge that can't represent one
 * doesn't just miss the change, it draws the clip in both places at once.
 *
 * The scope is therefore authoritative in both directions. Whatever `incoming`
 * says about those tracks is the complete truth about them, including saying
 * nothing at all — an emptied track is a scope entry with no clips, not a
 * missing entry.
 *
 * Incoming clips **outside** the declared scope are dropped rather than
 * trusted. Nothing would ever replace them — the next delta only ever rewrites
 * its own scope — so a payload that disagrees with itself would otherwise leave
 * a clip in the snapshot that no later re-read can correct.
 *
 * Result is ordered by `(t, s)`, the order `snapshot` builds in, so a merged
 * snapshot is indistinguishable from a freshly walked one.
 */
export function mergeTrackDelta<T extends ClipAddress>(
  clips: readonly T[],
  scope: readonly number[],
  incoming: readonly T[],
): T[] {
  const replaced = new Set(scope);
  const out: T[] = [];
  for (const c of clips) if (!replaced.has(c.t)) out.push(c);
  for (const c of incoming) if (replaced.has(c.t)) out.push(c);
  out.sort((a, b) => a.t - b.t || a.s - b.s);
  return out;
}

/**
 * Whether a delta computed against `prevRev` can be applied to what we hold.
 *
 * Revisions are a monotonic counter owned by `lom.ts`, bumped once per publish.
 * A delta rewrites only its own scope, so applying one to any state other than
 * the exact one it was computed against would merge two different sets — the
 * unscoped tracks would be from one revision and the scoped ones from another.
 *
 * A mismatch is not an error, it's a missed message: the answer is a full
 * snapshot, not a retry.
 */
export function canApplyDelta(heldRev: number, prevRev: number): boolean {
  return heldRev === prevRev;
}
