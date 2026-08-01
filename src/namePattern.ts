// Name patterns that can be read back.
//
// A pattern like `{song} {bpm?} {key?} [{role?}]` compiles into three things:
// a formatter, a parser, and a verdict on whether it was safe to compile at
// all. The parser is the point. Writing names is easy; the whole scheme rests
// on being able to look at "Nightfall 128 Bm [chorus]" six months later and
// recover which song and which role it belongs to, with nothing stored on the
// side. That's what lets the mapping live in the set, need no stable ids, and
// travel with the `.als`.
//
// ## Two kinds of ambiguity, and only one of them is fatal
//
// **Undecidable.** `{song} {label}` — two free-text fields with a space
// between them. "Glass Tunnel Arp" splits three ways and nothing in the string
// says which. No resolution rule helps, so patterns like this are rejected
// when you write them rather than mis-parsed 848 times later.
//
// **Resolvable.** `{song} {bpm?}` — "Nightfall 128" could be a song called
// "Nightfall 128" with no tempo, or "Nightfall" at 128. Both are real parses,
// but one is obviously meant, so there's a stated rule: **a name is read as
// filling as many parts as it can.** That's implemented by matching the free
// token lazily, and it's why this is allowed where the first case isn't.
//
// ## The probe is the validator
//
// Structural checks catch the undecidable cases and give them good messages.
// Everything else is settled by *measuring*: compile the pattern, format
// sample values through it, parse them back, and require they survive. A
// pattern whose own samples don't round-trip is rejected with both sides
// printed. That's deliberate — it means this file doesn't need a complete
// theory of when a pattern is reversible, only an honest test, and a pattern
// shape nobody anticipated fails loudly at definition time instead of quietly
// at apply time.

/** What one token's values may look like. */
export interface TokenSpec {
  /**
   * Regex source matching a single value. No anchors, no capture groups —
   * the compiler adds both.
   */
  shape: string;
  /**
   * True when values may contain anything, separators included. A pattern may
   * hold **at most one** free token; two of them is the undecidable case.
   */
  free?: boolean;
  /** Values the probe formats and parses back. Two, so a pattern that only
   *  works for one shape (a single word, say) can't slip through. */
  samples: [string, string];
}

export type TokenRegistry = Readonly<Record<string, TokenSpec>>;

/**
 * The convention the app writes.
 *
 *   [CHORUS] @128-Bm NIGHTFALL
 *    └ role┘  │  │   └ song ┘
 *             │  └ key
 *             └ bpm
 *
 * **Role first, then the facts, then the name**, so a column of scene names
 * reads as structure rather than as a list of titles. Everything but `{song}` is
 * optional, so a set nobody has mapped yet still parses — every scene reads as a
 * song with no facts rather than as 848 unmapped rows.
 *
 * Two characters do all the delimiting, and neither is decoration:
 *
 * - **`@` opens the facts from the front.** It can't appear in `ROLE_CHARS` and
 *   won't start a song title, so the group is identifiable before you've read
 *   any of it — which is what makes the *closing* bracket unnecessary.
 * - **`-` joins them, and drops when either side is missing.** After the `@` a
 *   digit begins a bpm and a letter begins a key, so `@128-Bm`, `@128` and `@Bm`
 *   are all distinguishable with no further punctuation. That's the whole reason
 *   the facts need no bracket of their own.
 *
 * The role keeps its brackets, and that asymmetry is deliberate: a bare word
 * could only be recognised by matching the vocabulary, so renaming a role would
 * make every scene using it silently roleless. `bpm` and `key` are recognised by
 * *shape*, so they need no such protection. See `roles.ts`.
 */
export const DEFAULT_SCENE_PATTERN = '([{role}])? (@{bpm?}-{key?})? {song}';

/**
 * The convention this app wrote before the one above — `Nightfall 128 Bm [chorus]`.
 *
 * Kept, and still compiled, because **derivation reads the mapping out of the
 * names**. Retiring it would make every scene in an existing set unmapped the
 * moment the pattern changed: the songs would vanish from the grid, and there
 * would be nothing left to select in order to rename them into the new
 * convention. `derive.ts` tries patterns in order, so a set converts scene by
 * scene as it's renamed rather than all at once.
 */
export const LEGACY_SCENE_PATTERN = '{song} {bpm?} {key?} [{role?}]';

/**
 * Tokens available in a scene name.
 *
 * `bpm` and `key` are shape-constrained, which is what makes `{song} {bpm}
 * {key}` reversible at all — `song` is the only free field, so its extent
 * falls out of the others matching. Clip-name tokens will land as their own
 * registry; nothing here assumes there's only one.
 */
export const SCENE_TOKENS: TokenRegistry = {
  song: { shape: '.+', free: true, samples: ['Nightfall', 'Glass Tunnel'] },
  bpm: { shape: '\\d{2,3}', samples: ['128', '92'] },
  key: { shape: '[A-G][#b]?m?', samples: ['Bm', 'F#m'] },
  role: {
    // Matches ROLE_CHARS in roles.ts. Spaces are allowed, which is fine
    // because the tag is bracketed — the literals do the delimiting.
    shape: "[A-Za-z0-9][A-Za-z0-9 &'\\-]*",
    samples: ['chorus', 'post chorus'],
  },
};

// --- pattern text -> segments -----------------------------------------

type Segment =
  | { kind: 'literal'; text: string }
  | { kind: 'token'; name: string; optional: boolean }
  /**
   * `( … )?` — a run that appears together or not at all, carrying its own
   * delimiters out with it.
   *
   * This exists because the rule an optional *token* follows — take the literal
   * before you, and the one after you only at the very end of the pattern —
   * can't express a bracketed field in the middle of a name. `[{role?}] {song}`
   * formats a role-less scene as `] NIGHTFALL`: the opening bracket goes with
   * the token, the closing one is stranded. Nothing short of grouping fixes
   * that, and every convention that puts the title last needs it.
   *
   * Groups don't nest. One level covers `([{role}])?` and `(@{bpm?}-{key?})?`,
   * and a nested version would need a story for what a half-present inner group
   * means that nobody has a use for yet.
   */
  | { kind: 'group'; nodes: Segment[] };

const TOKEN_AT = /^\{([A-Za-z][A-Za-z0-9]*)(\??)\}/;

/**
 * `(` only opens a group when there's a matching `)?` — otherwise it's a
 * literal. That's what lets a pattern contain a plain parenthesis without an
 * escape mechanism this file would otherwise have to invent.
 */
function segmentsOf(pattern: string, allowGroups = true): Segment[] {
  const out: Segment[] = [];
  let lit = '';
  let i = 0;
  const flush = () => {
    if (lit !== '') out.push({ kind: 'literal', text: lit });
    lit = '';
  };

  while (i < pattern.length) {
    if (allowGroups && pattern[i] === '(') {
      const close = pattern.indexOf(')?', i + 1);
      if (close !== -1) {
        flush();
        out.push({ kind: 'group', nodes: segmentsOf(pattern.slice(i + 1, close), false) });
        i = close + 2;
        continue;
      }
    }
    const m = TOKEN_AT.exec(pattern.slice(i));
    if (m) {
      flush();
      out.push({ kind: 'token', name: m[1]!, optional: m[2] === '?' });
      i += m[0].length;
      continue;
    }
    lit += pattern[i];
    i++;
  }
  flush();
  return out;
}

/** Every token in a pattern, groups flattened. */
function tokensIn(segments: Segment[]): Extract<Segment, { kind: 'token' }>[] {
  const out: Extract<Segment, { kind: 'token' }>[] = [];
  for (const s of segments) {
    if (s.kind === 'token') out.push(s);
    else if (s.kind === 'group') out.push(...tokensIn(s.nodes));
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A token together with the literals it owns.
 *
 * An optional token takes its preceding literal with it, and its following one
 * too when that's the end of the pattern — so dropping `role` from
 * `{song} [{role?}]` removes the brackets rather than leaving `Nightfall []`.
 * Anything more tangled than that isn't reasoned about here; the probe decides.
 */
interface Unit {
  prefix: string;
  name: string;
  optional: boolean;
  suffix: string;
}

/**
 * One piece of a group.
 *
 * `sepFor` is what makes `@128-Bm`, `@128` and `@Bm` fall out of one pattern: a
 * literal sitting *between* two tokens is a **separator**, and a separator only
 * means anything when both sides are there. Name the tokens it joins and it can
 * drop with either of them. A literal at the group's edge — the `@`, the
 * brackets — joins nothing, so it stands as long as the group does.
 */
type GroupPart =
  | { kind: 'literal'; text: string; sepFor: string[] }
  | { kind: 'token'; name: string; optional: boolean };

type Emit =
  | { kind: 'literal'; text: string }
  | ({ kind: 'token' } & Unit)
  | { kind: 'group'; parts: GroupPart[] };

/** A group's segments, with each internal literal told which tokens it joins. */
function partsOf(nodes: Segment[]): GroupPart[] {
  return nodes.map((n, i) => {
    if (n.kind !== 'literal') {
      // Groups don't nest, so anything not a literal here is a token.
      const t = n as Extract<Segment, { kind: 'token' }>;
      return { kind: 'token', name: t.name, optional: t.optional };
    }
    // `findLast` needs lib es2023; the project targets lower, and a reverse
    // scan says the same thing without moving the whole build.
    const earlier = nodes.slice(0, i).filter((s) => s.kind === 'token');
    const before = earlier[earlier.length - 1];
    const after = nodes.slice(i + 1).find((s) => s.kind === 'token');
    const joins = [before, after].filter((s) => s !== undefined);
    return {
      kind: 'literal',
      text: n.text,
      // Only a literal with a token on *both* sides is a separator.
      sepFor: joins.length === 2 ? joins.map((s) => (s as { name: string }).name) : [],
    };
  });
}

function unitsOf(segments: Segment[]): Emit[] {
  const out: Emit[] = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i]!;
    if (seg.kind === 'group') {
      out.push({ kind: 'group', parts: partsOf(seg.nodes) });
      i++;
      continue;
    }
    if (seg.kind === 'token') {
      out.push({ kind: 'token', prefix: '', name: seg.name, optional: seg.optional, suffix: '' });
      i++;
      continue;
    }
    const next = segments[i + 1];
    if (next?.kind === 'token' && next.optional) {
      const prefix = seg.text;
      i += 2;
      let suffix = '';
      // Only a trailing literal is absorbed. A literal followed by another
      // token belongs to that token as its own prefix.
      if (i === segments.length - 1 && segments[i]?.kind === 'literal') {
        suffix = (segments[i] as { text: string }).text;
        i++;
      }
      out.push({ kind: 'token', prefix, name: next.name, optional: true, suffix });
      continue;
    }
    out.push({ kind: 'literal', text: seg.text });
    i++;
  }
  return out;
}

// --- errors -----------------------------------------------------------

export type PatternError =
  | { kind: 'no-tokens' }
  | { kind: 'unknown-token'; token: string }
  | { kind: 'duplicate-token'; token: string }
  | { kind: 'two-free-tokens'; a: string; b: string }
  | { kind: 'run-together'; a: string; b: string }
  | { kind: 'optional-free'; token: string }
  | { kind: 'optional-first'; token: string }
  | { kind: 'no-round-trip'; sent: string; formatted: string; readBack: string };

/** One line a person can act on. */
export function describePatternError(e: PatternError): string {
  switch (e.kind) {
    case 'no-tokens':
      return 'A pattern needs at least one {token}.';
    case 'unknown-token':
      return `There is no {${e.token}} token.`;
    case 'duplicate-token':
      return `{${e.token}} appears twice — a name can only say it once.`;
    case 'two-free-tokens':
      return (
        `{${e.a}} and {${e.b}} are both free text with only a space between them, ` +
        `so a name using both can't be read back — nothing says where one ends ` +
        `and the other begins. Separate them with a literal like " - ", or drop one.`
      );
    case 'run-together':
      return `{${e.a}} and {${e.b}} need something between them, or a name can't be split.`;
    case 'optional-free':
      return `{${e.token}?} is free text, and a missing free field is indistinguishable from an empty one.`;
    case 'optional-first':
      return `{${e.token}?} needs something before it, so there is a separator to drop with it.`;
    case 'no-round-trip':
      return (
        `This pattern doesn't survive its own round trip: "${e.sent}" was written ` +
        `as "${e.formatted}" and read back as "${e.readBack}".`
      );
  }
}

// --- compiling --------------------------------------------------------

export interface PatternToken {
  name: string;
  optional: boolean;
}

export interface CompiledPattern {
  readonly pattern: string;
  readonly tokens: readonly PatternToken[];
  /** The anchored regex the parser runs. Exposed for tests and for debugging. */
  readonly source: string;
  /**
   * Values into a name. Missing tokens are dropped along with the punctuation
   * that only existed for them, then whitespace is collapsed — so an absent
   * `{key}` can never leave a double space or a literal `{key}` in the set.
   */
  format(values: Readonly<Record<string, string | number | null | undefined>>): string;
  /**
   * A name back into values, or `null` when it doesn't match the pattern.
   *
   * `null` is a real answer and the common one during the mapping pass: it
   * means this scene isn't named by this scheme yet. It is never a partial
   * result — a half-parsed name would attach a scene to the wrong song.
   */
  parse(name: string): Record<string, string> | null;
}

function structuralErrors(
  segments: Segment[],
  registry: TokenRegistry,
): PatternError[] {
  const errors: PatternError[] = [];
  const tokens = tokensIn(segments);

  if (tokens.length === 0) return [{ kind: 'no-tokens' }];

  const seen = new Set<string>();
  for (const t of tokens) {
    if (!(t.name in registry)) {
      errors.push({ kind: 'unknown-token', token: t.name });
      continue;
    }
    if (seen.has(t.name)) errors.push({ kind: 'duplicate-token', token: t.name });
    seen.add(t.name);
    if (t.optional && registry[t.name]!.free) {
      errors.push({ kind: 'optional-free', token: t.name });
    }
  }
  // A free token inside an optional group is the same mistake wearing a group:
  // an absent free field and an empty one are indistinguishable either way.
  for (const g of segments) {
    if (g.kind !== 'group') continue;
    for (const t of tokensIn(g.nodes)) {
      if (registry[t.name]?.free) errors.push({ kind: 'optional-free', token: t.name });
    }
  }
  // Unknown tokens make every check below meaningless — there's no shape to
  // reason about — so stop here rather than pile on errors that follow from it.
  if (errors.some((e) => e.kind === 'unknown-token')) return errors;

  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i]!;
    const b = segments[i + 1]!;
    if (a.kind !== 'token' || b.kind !== 'token') continue;
    // Two shape-constrained tokens can sometimes run together unambiguously
    // ("128Bm"), and the probe will say so. A free one never can.
    if (registry[a.name]!.free || registry[b.name]!.free) {
      errors.push({ kind: 'run-together', a: a.name, b: b.name });
    }
  }

  // The undecidable case, and it's about the *separator*, not the count.
  //
  // Two free fields with only whitespace between them can't be split —
  // "Glass Tunnel Arp" gives nothing away, and free text routinely contains
  // spaces. A literal with something in it does give it away, which is the
  // whole difference between `{song} {label}` and `{song} - {label}`. Only
  // *consecutive* free tokens are checked: with a shape-constrained token
  // between them there's a fixed point to match from, and the probe decides.
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i]!;
    if (a.kind !== 'token' || !registry[a.name]!.free) continue;
    const between = segments[i + 1]!;
    const b = between.kind === 'literal' ? segments[i + 2] : between;
    if (!b || b.kind !== 'token' || !registry[b.name]!.free) continue;
    const lit = between.kind === 'literal' ? between.text : '';
    if (lit === '') continue; // no separator at all — run-together said so
    if (lit.trim() === '') {
      errors.push({ kind: 'two-free-tokens', a: a.name, b: b.name });
    }
  }

  // An optional token drops its preceding literal when it's absent. Without
  // one there is no separator to drop, and the name closes up wrongly. A group
  // is exempt: it carries its own delimiters, which is what it's for.
  const first = segments[0];
  if (first?.kind === 'token' && first.optional) {
    errors.push({ kind: 'optional-first', token: first.name });
  }

  return errors;
}

function build(pattern: string, registry: TokenRegistry): CompiledPattern {
  const segments = segmentsOf(pattern);
  const units = unitsOf(segments);
  const tokens: PatternToken[] = [];

  let source = '^';
  units.forEach((u, i) => {
    if (u.kind === 'literal') {
      // A space *next to a group* becomes `\s*`: the group can vanish, and then
      // there's nothing for the space to sit between. `format` collapses runs of
      // whitespace, so the two halves agree.
      //
      // Only next to a group, though. Relaxing every space breaks a pattern
      // whose tokens are all required — `{song} {role}` with a lazy `{song}`
      // reads "Nightfall chorus" as song "N" and role "ightfall chorus" the
      // moment the space between them stops being mandatory.
      const nextToGroup =
        units[i - 1]?.kind === 'group' || units[i + 1]?.kind === 'group';
      source += u.text.trim() === '' && nextToGroup ? '\\s*' : escapeRe(u.text);
      return;
    }
    if (u.kind === 'group') {
      let inner = '';
      for (const p of u.parts) {
        if (p.kind === 'literal') {
          // A separator is optional in the regex for the same reason it's
          // droppable in the formatter — `@128` has no `-` to match.
          inner += p.sepFor.length > 0 ? `(?:${escapeRe(p.text)})?` : escapeRe(p.text);
          continue;
        }
        const s = registry[p.name]!;
        inner += `(${s.shape}${s.free ? '?' : ''})${p.optional ? '?' : ''}`;
        tokens.push({ name: p.name, optional: true });
      }
      source += `(?:${inner})?`;
      return;
    }
    const spec = registry[u.name]!;
    // Free tokens match lazily so an optional field later in the pattern gets
    // filled rather than swallowed — the "read a name as filling as many parts
    // as it can" rule in the header.
    const body = `(${spec.shape}${spec.free ? '?' : ''})`;
    const piece = escapeRe(u.prefix) + body + escapeRe(u.suffix);
    source += u.optional ? `(?:${piece})?` : piece;
    tokens.push({ name: u.name, optional: u.optional });
  });
  source += '$';

  const re = new RegExp(source);

  return {
    pattern,
    tokens,
    source,
    format(values) {
      let out = '';
      const given = (n: string) => {
        const v = values[n];
        return v === undefined || v === null ? '' : String(v).trim();
      };
      for (const u of units) {
        if (u.kind === 'literal') {
          out += u.text;
          continue;
        }
        if (u.kind === 'group') {
          const names = u.parts.filter((p) => p.kind === 'token').map((p) => p.name);
          // All or nothing: a group with no values at all takes its delimiters
          // with it, which is the entire reason groups exist.
          if (!names.some((n) => given(n) !== '')) continue;
          for (const p of u.parts) {
            if (p.kind === 'token') out += given(p.name);
            else if (p.sepFor.every((n) => given(n) !== '')) out += p.text;
          }
          continue;
        }
        const v = values[u.name];
        const s = v === undefined || v === null ? '' : String(v).trim();
        if (s === '') {
          // A required token with no value still drops cleanly rather than
          // writing "{key}" into the set; the collapse below tidies up after.
          if (!u.optional) out += u.prefix + u.suffix;
          continue;
        }
        out += u.prefix + s + u.suffix;
      }
      return out.replace(/\s+/g, ' ').trim();
    },
    parse(name) {
      const m = re.exec(name.trim());
      if (!m) return null;
      const out: Record<string, string> = {};
      tokens.forEach((t, i) => {
        const v = m[i + 1];
        if (v !== undefined) out[t.name] = v.trim();
      });
      return out;
    },
  };
}

/**
 * Format sample values through the pattern and read them back.
 *
 * Runs the all-present case with both sample sets, then drops each optional
 * token in turn — linear in the number of optionals rather than exponential,
 * which is enough to catch a pattern whose punctuation doesn't survive a
 * missing field. This is what makes the structural rules above allowed to be
 * incomplete.
 */
function probeErrors(
  compiled: CompiledPattern,
  registry: TokenRegistry,
): PatternError[] {
  const names = compiled.tokens.map((t) => t.name);
  const sample = (n: string, which: 0 | 1) => registry[n]!.samples[which];

  const cases: Record<string, string>[] = [
    Object.fromEntries(names.map((n) => [n, sample(n, 0)])),
    Object.fromEntries(names.map((n) => [n, sample(n, 1)])),
  ];
  for (const t of compiled.tokens) {
    if (!t.optional) continue;
    cases.push(
      Object.fromEntries(
        names.filter((n) => n !== t.name).map((n) => [n, sample(n, 0)]),
      ),
    );
  }

  for (const values of cases) {
    const formatted = compiled.format(values);
    const back = compiled.parse(formatted);
    const keys = new Set([...Object.keys(values), ...Object.keys(back ?? {})]);
    const same = back !== null && [...keys].every((k) => back[k] === values[k]);
    if (!same) {
      return [
        {
          kind: 'no-round-trip',
          sent: JSON.stringify(values),
          formatted,
          readBack: back === null ? '(no match)' : JSON.stringify(back),
        },
      ];
    }
  }
  return [];
}

/**
 * Everything wrong with a pattern, or an empty array.
 *
 * Call this from the pattern editor: the point of rejecting a pattern is that
 * you find out while writing it, not after it has renamed a set.
 */
export function patternErrors(
  pattern: string,
  registry: TokenRegistry = SCENE_TOKENS,
): PatternError[] {
  const structural = structuralErrors(segmentsOf(pattern), registry);
  if (structural.length > 0) return structural;
  return probeErrors(build(pattern, registry), registry);
}

/** The compiled pattern, or `null` when `patternErrors` isn't empty. */
export function compilePattern(
  pattern: string,
  registry: TokenRegistry = SCENE_TOKENS,
): CompiledPattern | null {
  if (patternErrors(pattern, registry).length > 0) return null;
  return build(pattern, registry);
}
