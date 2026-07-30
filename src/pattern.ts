// Token template evaluation — the naming half of the scheme.
//
// A pattern is a string with `{token}` placeholders, e.g.
//   "{bpm} {key} {label} {role}"  ->  "128 Bm Arp Jam 1"
//
// Pure and transport-free by design: this is the piece that has to be provably
// correct before it renames 848 clips.

export const TOKENS = [
  'track',
  'scene',
  'name',
  'role',
  'song',
  'bpm',
  'key',
  'label',
  'n',
] as const;

export type Token = (typeof TOKENS)[number];

export type TokenValues = Partial<Record<Token, string | number | undefined>>;

const TOKEN_RE = /\{([a-zA-Z]+)\}/g;

/** Tokens referenced by a pattern, in order of first appearance, deduped. */
export function tokensIn(pattern: string): string[] {
  const seen = new Set<string>();
  for (const m of pattern.matchAll(TOKEN_RE)) seen.add(m[1]);
  return [...seen];
}

/** Tokens a pattern references that aren't in the known set. */
export function unknownTokens(pattern: string): string[] {
  return tokensIn(pattern).filter((t) => !(TOKENS as readonly string[]).includes(t));
}

/**
 * Substitutes `{token}`s. Unknown tokens and tokens with no value are dropped,
 * then whitespace is collapsed — so a missing `{key}` leaves no double space
 * and no stray `{key}` written into a clip name.
 */
export function render(pattern: string, values: TokenValues): string {
  const out = pattern.replace(TOKEN_RE, (_, name: string) => {
    const v = values[name as Token];
    return v === undefined || v === null ? '' : String(v);
  });
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a song title following the `{bpm} {key} {label}` convention the set
 * already uses, e.g. "128 Bm Arp". Returns undefined fields rather than
 * guessing when the title doesn't match.
 */
export function parseSongTitle(title: string): {
  bpm?: number;
  key?: string;
  label?: string;
} {
  const m = /^\s*(\d{2,3})\s+([A-G][#b]?m?)\s+(.+?)\s*$/.exec(title);
  if (!m) return {};
  return { bpm: Number(m[1]), key: m[2], label: m[3] };
}
