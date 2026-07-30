// Parsing for the atom shapes the Live Object Model returns.
//
// Mirrors the helpers in bridge/src/lom.ts, which cannot import anything (it
// compiles with `module: "none"` so Max's [v8] can find its handlers as
// globals). Kept here so the parsing is unit-testable without Live running —
// it's the part of the snapshot walk most likely to be wrong.

/**
 * Object-list properties come back as alternating `'id', n` atoms, e.g.
 * `['id', 4, 'id', 5]`. Returns just the numeric ids.
 */
export function parseIds(v: unknown): number[] {
  const out: number[] = [];
  if (!Array.isArray(v)) return out;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === 'id' && i + 1 < v.length) {
      out.push(Number(v[i + 1]));
      i++;
    }
  }
  return out;
}

/** Single-object property; 0 means "nothing there". */
export function parseId(v: unknown): number {
  const ids = parseIds(v);
  return ids.length ? ids[0] : 0;
}

/**
 * Single-object property, keeping "empty" and "unreadable" apart.
 *
 * `parseId` collapses both to 0, which is how a broken fast path in the slot
 * scan could report a set full of clips as a set with none: every cursor came
 * back unreadable and every slot therefore looked empty. Anywhere that failure
 * would be silent, use this instead.
 *
 * Returns the id, `0` for a slot that resolved but holds nothing, or `-1` when
 * the reply was not an `['id', n]` atom pair at all.
 */
export function parseObjectRef(v: unknown): number {
  if (!Array.isArray(v) || v.length < 2 || v[0] !== 'id') return -1;
  const n = Number(v[1]);
  return Number.isFinite(n) ? n : -1;
}

/** Max atoms for a string property. Multi-word values may arrive split. */
export function parseStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.length === 1 ? String(v[0]) : v.map(String).join(' ');
  return String(v);
}

/** Max atoms for a numeric property; non-numeric collapses to 0. */
export function parseNum(v: unknown): number {
  const x = Array.isArray(v) ? v[0] : v;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Numeric property that Live is allowed to answer with nothing.
 *
 * A scene's `color_index` is documented as "Can be None for no color", and an
 * uncolored scene must not be mistaken for one sitting on palette slot 0 —
 * which is exactly what `parseNum` would do. Whatever atom Max hands over for
 * None (a symbol, an empty list, nothing at all) is not a finite number, so it
 * takes the fallback.
 */
export function parseNumOr(v: unknown, fallback: number): number {
  const x = Array.isArray(v) ? (v.length ? v[0] : undefined) : v;
  if (x === undefined || x === null || x === '') return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
