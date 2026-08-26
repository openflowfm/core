// Which device runs anyone is looking at, reduced to the one answer the LOM
// gets asked for.
//
// Every other watch in this project is a boolean per kind: play state is either
// on or off, and the bridge refcounts it across clients in one Set<WebSocket>.
// That works because the cost doesn't depend on what you're watching — arming
// `watch_play` costs the same whoever asked and however many did.
//
// Device parameters break it on both axes at once. The cost depends entirely on
// *which* run and *which* devices in it, and two clients can want different
// ones — so a boolean can't express the question and a per-kind refcount can't
// answer it. Neither client may turn the other's watch off, which is the exact
// bug per-kind refcounting was introduced to prevent, one level down.
//
// So the union lives here rather than in bridge.ts: it is set arithmetic over
// what clients declared, it decides how many LOM observers get installed, and
// getting it wrong is either a leak that slows Live down or a client watching
// something nobody is looking at. That belongs where there are tests.
//
// Structurally typed like ops.ts and snapshotDelta.ts — this needs the address
// fields and nothing else, and keeping core free of the wire types is what lets
// it be tested with no transport around it.

/** One device run a client is looking at, and which of its devices are open. */
export interface ChainWatch {
  /** Track index, in the same space as a snapshot's tracks. */
  t: number;
  /**
   * Which run inside that track. Empty is the track's own device list;
   * `[2, 0]` is the first chain of the rack at index 2, and it nests from
   * there — a rack inside a chain adds two more entries.
   *
   * Always an even length, therefore: each step down is a device *and* the
   * chain of it being descended into.
   */
  path: readonly number[];
  /**
   * Indexes in that run whose parameters are wanted. Everything else in the run
   * is drawn as a shell, which costs two observers instead of forty.
   *
   * This is the field that makes the whole scheme affordable, so it is a list
   * rather than a flag: one run at a time, several devices open inside it, and
   * a device folded shut drops its parameters without dropping the run.
   */
  open: readonly number[];
}

/**
 * Stable identity for a run. Two clients naming the same one must merge, and a
 * path is the only address a device has — see `set/docs/device-chain.md`.
 */
export function chainKey(w: ChainWatch): string {
  return w.t + ':' + w.path.join('.');
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/**
 * Every run anyone is watching, with the open sets unioned.
 *
 * **Union, never intersection, and that is the whole point.** Two clients
 * looking at two different racks both get theirs. Two looking at the same run
 * with different devices open get both sets, because a client that folded a
 * device may not blind one that has it open.
 *
 * The result is ordered — by track, then by path, then ascending within `open`
 * — so an unchanged set of declarations always produces an identical value.
 * That is what lets the caller skip re-sending, which matters because the
 * receiving side rebuilds every observer it holds each time it is told.
 *
 * A run whose `open` is empty is still in the result. It is a real subscription
 * to the run's shells; dropping it because no device is expanded would stop the
 * one thing the shell tier exists for — noticing a device added in Live.
 */
export function mergeChainWatches(
  perClient: readonly (readonly ChainWatch[])[],
): ChainWatch[] {
  const byKey = new Map<string, { t: number; path: readonly number[]; open: Set<number> }>();
  for (const declared of perClient) {
    for (const w of declared) {
      const key = chainKey(w);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { t: w.t, path: w.path, open: new Set<number>() };
        byKey.set(key, entry);
      }
      // A client listing the same run twice folds into one entry here, so the
      // caller never has to dedupe its own message before sending it.
      for (const i of w.open) entry.open.add(i);
    }
  }
  return [...byKey.values()]
    .map((e) => ({ t: e.t, path: e.path, open: [...e.open].sort((a, b) => a - b) }))
    .sort((a, b) => a.t - b.t || comparePaths(a.path, b.path));
}

function comparePaths(a: readonly number[], b: readonly number[]): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * Whether two merged unions ask for the same thing.
 *
 * Both sides are `mergeChainWatches` output, so both are already in canonical
 * order and this is a walk rather than a set comparison. The caller uses it to
 * skip a rebuild: telling the LOM side to re-arm costs it every observer it
 * holds, so an unchanged union must not reach it.
 */
export function sameChainWatches(
  a: readonly ChainWatch[],
  b: readonly ChainWatch[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (w, i) =>
        w.t === b[i].t && sameNumbers(w.path, b[i].path) && sameNumbers(w.open, b[i].open),
    )
  );
}

/**
 * Reject a malformed declaration whole rather than half-trusting it.
 *
 * The same bargain `chainDevice` makes on the way in: a subscription with a
 * negative index or a fractional path would install observers against paths
 * that cannot resolve, and the symptom of that is Live posting errors from a
 * callback with nothing naming the client that asked. Refuse it at the edge,
 * where there is still a socket to blame.
 */
export function validChainWatch(v: unknown): v is ChainWatch {
  if (!v || typeof v !== 'object') return false;
  const w = v as Partial<ChainWatch>;
  const index = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  return (
    index(w.t) &&
    Array.isArray(w.path) &&
    // Pairs: a run inside a rack is `devices M chains L`. An odd length names
    // half an address, which resolves to nothing and would install observers
    // against a path Live cannot answer.
    w.path.length % 2 === 0 &&
    w.path.every(index) &&
    Array.isArray(w.open) &&
    w.open.every(index)
  );
}
