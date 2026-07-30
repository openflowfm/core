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
