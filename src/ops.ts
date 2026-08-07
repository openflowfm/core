// Assembling and reversing clip writes.
//
// The LOM gives us no undo — writes through it don't participate reliably in
// Live's own history — so anything that overwrites user data has to carry its
// own way back. That's cheap here because a snapshot already holds every clip's
// name and color, so the "before" side of a write is known without asking Live
// for it.
//
// Structurally typed rather than importing BSV.Clip / BSV.ApplyOp: this needs
// four fields, and keeping core free of the wire types is what lets it be tested
// without any transport around it.

export interface ClipFields {
  t: number;
  s: number;
  name: string;
  /** Slot in Live's palette. */
  colorIndex: number;
}

export interface WriteOp {
  t: number;
  s: number;
  name?: string;
  colorIndex?: number;
}

function key(t: number, s: number): string {
  return `${t}:${s}`;
}

/**
 * Ops that put back whatever `ops` is about to overwrite.
 *
 * Three things are deliberately left out of the result:
 *
 * - **Cells with no clip in `before`.** `apply` skips an empty slot, so there is
 *   nothing to restore, and writing a name onto one would fail anyway.
 * - **Fields the op didn't write.** Reverting a color that was never touched
 *   would make undo destructive in its own right.
 * - **Writes that change nothing.** Recoloring a clip to the color it already
 *   has needs no undo entry, and dropping those keeps the reverse batch as small
 *   as the visible effect.
 *
 * That last one means an empty result is meaningful: it says the write had no
 * effect to undo, not that undo failed.
 */
export function inverseOps(
  before: readonly ClipFields[],
  ops: readonly WriteOp[],
): WriteOp[] {
  const at = new Map<string, ClipFields>();
  for (const c of before) at.set(key(c.t, c.s), c);

  const out: WriteOp[] = [];
  for (const op of ops) {
    const prev = at.get(key(op.t, op.s));
    if (!prev) continue;

    const back: WriteOp = { t: op.t, s: op.s };
    let changed = false;
    if (op.name !== undefined && op.name !== prev.name) {
      back.name = prev.name;
      changed = true;
    }
    if (op.colorIndex !== undefined && op.colorIndex !== prev.colorIndex) {
      back.colorIndex = prev.colorIndex;
      changed = true;
    }
    if (changed) out.push(back);
  }
  return out;
}

/**
 * A clip as the grid holds it: the fields a write can change, plus the RGB the
 * UI draws. `color` is never written — it follows `colorIndex`, which is why
 * `applyOps` needs to be told how to resolve one to the other.
 */
export interface ColoredClip extends ClipFields {
  color: number;
}

/**
 * `clips` as they read once `ops` have landed, so a write doesn't have to be
 * followed by re-walking the set.
 *
 * The walk costs tens of thousands of LOM reads; a rename changes one string,
 * and the caller already knows which one. This is that arithmetic, here rather
 * than in the UI because getting it wrong shows the user a grid that disagrees
 * with Live and gives no hint which of the two is lying.
 *
 * **Only sound when Live took every op.** `apply` answers with counts, not with
 * *which* ops it skipped, so a partial write cannot be reproduced from here.
 * Callers compare `applied` against what they sent and fall back to a real
 * snapshot when the two differ — that fallback is what makes this safe to be
 * optimistic about.
 *
 * Ops are applied in order, so a second write to the same cell wins, the same
 * as it would in Live.
 *
 * `rgbFor` resolves a palette slot to the RGB Live renders for it. Core has no
 * palette and shouldn't grow one — the caller holds it. `undefined` for an
 * unknown slot leaves the clip's existing RGB in place rather than painting it
 * black; a wrong color that looks deliberate is worse than a stale one, and the
 * caller should be re-reading rather than getting here at all.
 */
export function applyOps<T extends ColoredClip>(
  clips: readonly T[],
  ops: readonly WriteOp[],
  rgbFor: (colorIndex: number) => number | undefined,
): T[] {
  if (ops.length === 0) return [...clips];

  const at = new Map<string, WriteOp>();
  for (const op of ops) {
    const k = key(op.t, op.s);
    const prev = at.get(k);
    at.set(k, prev ? { ...prev, ...op } : op);
  }

  return clips.map((c) => {
    const op = at.get(key(c.t, c.s));
    if (!op) return c;
    const name = op.name ?? c.name;
    const colorIndex = op.colorIndex ?? c.colorIndex;
    const color = op.colorIndex === undefined ? c.color : (rgbFor(op.colorIndex) ?? c.color);
    return { ...c, name, colorIndex, color };
  });
}

/**
 * Color writes for `cells`, dropping the ones that would change nothing.
 *
 * The filter is what makes recoloring a scene honest about its own size: a
 * progress bar counting 30 writes when 22 of them are already that color
 * reports work that isn't happening.
 */
export function colorOps(
  before: readonly ClipFields[],
  cells: readonly { t: number; s: number }[],
  colorIndex: number,
): WriteOp[] {
  const at = new Map<string, ClipFields>();
  for (const c of before) at.set(key(c.t, c.s), c);

  const out: WriteOp[] = [];
  for (const cell of cells) {
    const prev = at.get(key(cell.t, cell.s));
    if (!prev || prev.colorIndex === colorIndex) continue;
    out.push({ t: cell.t, s: cell.s, colorIndex });
  }
  return out;
}
