// When the app should re-walk the whole set on its own initiative.
//
// The client follows Live through observers — a structural change, and the
// Session cursor reporting what the user is editing. Those cover what they
// cover. The backstop is for what they don't: properties Live exposes with no
// `observe` at all (`Clip.length`, `Track.fold_state`), another M4L device, a
// remote script. Nothing announces those, so the only way to learn about them
// is to look.
//
// This used to be "walk on every window focus", which spent ~950ms of Live's
// main thread on every alt-tab to answer a question that is almost always
// "nothing changed". The trigger that actually matches the job is **age**: how
// long since anything authoritative was read. Focus is just a convenient moment
// to ask, not a reason in itself.
//
// Pure so it can be tested. `now` is injected for the same reason.

/** How stale the set may get before the next opportunity re-walks it. */
export const STALE_MS = 5 * 60_000;

/**
 * The floor between attempts, however often the browser asks.
 *
 * Two jobs. It absorbs the burst — `focus` and `visibilitychange` both fire on
 * one alt-tab — and it rate-limits retries when a walk is failing, so a broken
 * LOM gets asked again eventually rather than either never or continuously.
 */
export const MIN_INTERVAL_MS = 30_000;

export interface Staleness {
  now: number;
  /**
   * When a full walk last **succeeded**, or null if none has.
   *
   * Deliberately not bumped by a delta. A delta proves the bridge is alive and
   * following; only a walk proves everything is current. If deltas reset this,
   * a set being actively edited would never re-walk — which is exactly the set
   * most likely to have drifted somewhere no observer is watching.
   */
  lastSnapshotAt: number | null;
  /** When a walk was last attempted, successful or not; null if never. */
  lastAttemptAt: number | null;
  staleMs: number;
  minIntervalMs: number;
}

/**
 * Whether this is a moment to spend a full walk on.
 *
 * **Holding nothing is not staleness.** With no snapshot at all there is
 * nothing to distrust, and the first walk is owned by the once-per-session
 * effect in `useBridge` — which fires once deliberately, because a walk that
 * *fails* leaves the snapshot null with the LOM still ready, and re-running on
 * that condition is an infinite retry of the walk that just broke. Answering
 * false here keeps that one attempt one attempt.
 *
 * A walk that fails while we already hold a snapshot is different: the old one
 * stays stale, so this keeps returning true and `minIntervalMs` is what turns
 * that into a slow retry rather than a loop.
 */
export function shouldWalk({
  now,
  lastSnapshotAt,
  lastAttemptAt,
  staleMs,
  minIntervalMs,
}: Staleness): boolean {
  if (lastSnapshotAt === null) return false;
  if (lastAttemptAt !== null && now - lastAttemptAt < minIntervalMs) return false;
  return now - lastSnapshotAt >= staleMs;
}
