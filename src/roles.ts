// Roles — what a scene is *for*: intro, verse, chorus, jam.
//
// A role is stored in the scene's own name, as a bracketed tag at the end:
//
//   "Nightfall 128 Bm [chorus]"
//
// **The set is the storage.** Scenes have no stable id in the LOM, so a sidecar
// file could only be keyed by index — which silently relabels everything below
// an inserted scene — or by name, at which point the name is already the
// identity and the file buys nothing. Storing it in the name also means the role
// travels with the .als to the gig laptop and is visible in Live itself.
//
// **The tag is bracketed rather than a bare trailing word**, and that is the
// whole design. `parseSongTitle` already reads the last token as `{label}`, so
// "128 Bm Jam" is genuinely ambiguous. Worse, a bare word could only be
// recognised by matching it against the vocabulary — so renaming a role from
// "jam" to "solo" would make every scene using it silently roleless. A tag is
// still visibly *there* when its name is unknown, which is the difference
// between a failure you can see and fix and one that just loses data.
//
// Pure and transport-free, like the rest of core/. Nothing here knows what a
// palette index means to Live; colors travel through as opaque numbers.

/** A role in the vocabulary, and the palette slot it colors clips with. */
export interface Role {
  /** Display form — the case actually written into scene names. */
  name: string;
  /** Slot in Live's palette, or -1 when the role has no color yet. */
  colorIndex: number;
}

/**
 * Long enough for "post chorus", short enough that the tag doesn't swamp
 * Live's narrow scene column.
 */
export const MAX_ROLE_LEN = 24;

/**
 * Letters, digits, spaces, `&`, `-` and `'`. Deliberately narrow: a scene name
 * may legitimately carry brackets for other reasons ("[take 2]", "[alt mix]"),
 * and restricting what counts as a role name is what keeps those from being
 * read as roles. Must start with a letter or digit.
 */
const ROLE_CHARS = /^[A-Za-z0-9][A-Za-z0-9 &'-]*$/;

/** Every bracket group in a name. Non-greedy by construction — no nesting. */
const TAG_RE = /\[([^[\]]*)\]/g;

/** Trimmed, with internal runs of whitespace collapsed. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * The case-insensitive identity of a role. `[Chorus]` typed by hand in Live and
 * `[chorus]` written by us are the same role — being strict about case here
 * would show the same role twice in the manager and split its color in two.
 */
export function roleKey(role: string): string {
  return tidy(role).toLowerCase();
}

/** Whether `s` could be a role name at all. */
export function isValidRoleName(s: string): boolean {
  const t = tidy(s);
  return t.length > 0 && t.length <= MAX_ROLE_LEN && ROLE_CHARS.test(t);
}

interface TagSpan {
  role: string;
  start: number;
  end: number;
}

/**
 * The role tag in a scene name, or null.
 *
 * **The last valid tag wins**, matching where `withRole` writes one. That makes
 * the pair round-trip: tagging an already-tagged name replaces the tag rather
 * than accumulating a second one, however the first one got there.
 */
function findTag(sceneName: string): TagSpan | null {
  let found: TagSpan | null = null;
  TAG_RE.lastIndex = 0;
  for (const m of sceneName.matchAll(TAG_RE)) {
    if (!isValidRoleName(m[1]!)) continue;
    found = {
      role: tidy(m[1]!),
      start: m.index!,
      end: m.index! + m[0].length,
    };
  }
  return found;
}

/** The role a scene name carries, in its written case, or null. */
export function roleIn(sceneName: string): string | null {
  return findTag(sceneName)?.role ?? null;
}

/** The scene name with its role tag taken off — what the UI shows as the title. */
export function nameWithoutRole(sceneName: string): string {
  return withRole(sceneName, null);
}

/**
 * The scene name carrying `role`, or with its tag removed when `role` is null.
 *
 * Replaces an existing tag in place and appends at the end otherwise, so a
 * scene keeps whatever human title it already had.
 */
export function withRole(sceneName: string, role: string | null): string {
  const tag = role === null ? '' : `[${tidy(role)}]`;
  const at = findTag(sceneName);
  if (at) {
    return tidy(sceneName.slice(0, at.start) + tag + sceneName.slice(at.end));
  }
  return tidy(role === null ? sceneName : `${sceneName} ${tag}`);
}

/**
 * The roles actually present in the set, in order of first appearance.
 *
 * Deduped by `roleKey`, keeping the first spelling seen. This is what keeps the
 * manager honest: a role typed straight into Live shows up in the vocabulary
 * whether or not anyone configured it, rather than being invisible until it
 * mysteriously fails to color anything.
 */
export function rolesInUse(sceneNames: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of sceneNames) {
    const role = roleIn(name);
    if (role === null) continue;
    const k = roleKey(role);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(role);
  }
  return out;
}

/**
 * The configured vocabulary plus any role found in the set but never
 * configured, appended with no color (-1).
 *
 * -1 rather than slot 0, for the reason it's -1 everywhere else in this
 * project: slot 0 is a real color, and "nobody has chosen one" has to be
 * distinguishable from "somebody chose the first swatch".
 */
export function mergeVocabulary(
  configured: readonly Role[],
  inUse: readonly string[],
): Role[] {
  const out: Role[] = [];
  const seen = new Set<string>();
  for (const r of configured) {
    const k = roleKey(r.name);
    if (k === '' || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: tidy(r.name), colorIndex: r.colorIndex });
  }
  for (const name of inUse) {
    const k = roleKey(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: tidy(name), colorIndex: -1 });
  }
  return out;
}

/** The role's entry in a vocabulary, matched case-insensitively. */
export function findRole(vocabulary: readonly Role[], role: string): Role | undefined {
  const k = roleKey(role);
  return vocabulary.find((r) => roleKey(r.name) === k);
}

// --- scene writes -----------------------------------------------------
//
// The scene equivalent of ops.ts, and here for the same reason: assembling and
// reversing writes is exactly the logic that has to be provable without Live
// running. Structurally typed rather than importing BSV.Scene / BSV.SceneOp so
// core/ stays free of the wire types.

export interface SceneFields {
  s: number;
  name: string;
  /** Slot in Live's palette, or -1 when the scene has no color at all. */
  colorIndex: number;
  /** The RGB Live renders for that slot. */
  color: number;
}

export interface SceneWriteOp {
  s: number;
  name?: string;
  /**
   * Slot in Live's palette. Recorded as the intent and as what undo reverses;
   * `color` is what actually reaches Live, because a Scene's `color_index` is
   * documented nullable and Max's LiveAPI can read an Optional[int] but not
   * write one. See `bridge/README.md`.
   */
  colorIndex?: number;
  /** The RGB for `colorIndex`. Always written together with it. */
  color?: number;
}

/**
 * The scene half of a snapshot, in the shape the op builders want.
 *
 * Structurally typed over the snapshot's `Scene` rather than importing it —
 * `i` becomes `s` because everything addressed at a scene on the wire calls it
 * `s`, and having both names for the same number in one module is how an op
 * ends up written to the wrong row.
 */
export function sceneFields(
  scenes: readonly { i: number; name: string; colorIndex: number; color: number }[],
): SceneFields[] {
  return scenes.map((sc) => ({
    s: sc.i,
    name: sc.name,
    colorIndex: sc.colorIndex,
    color: sc.color,
  }));
}

function bySceneIndex(before: readonly SceneFields[]): Map<number, SceneFields> {
  const at = new Map<number, SceneFields>();
  for (const sc of before) at.set(sc.s, sc);
  return at;
}

/**
 * Name writes that tag `scenes` with `role`, or strip the tag when it's null.
 *
 * Scenes already carrying that role are dropped, so assigning "chorus" to a
 * block where six of ten already say chorus writes four — the same honesty
 * `colorOps` enforces for clips.
 */
export function roleOps(
  before: readonly SceneFields[],
  scenes: readonly number[],
  role: string | null,
): SceneWriteOp[] {
  const at = bySceneIndex(before);
  const out: SceneWriteOp[] = [];
  for (const s of scenes) {
    const prev = at.get(s);
    if (!prev) continue;
    const name = withRole(prev.name, role);
    if (name === prev.name) continue;
    out.push({ s, name });
  }
  return out;
}

/**
 * Color writes for `scenes`, dropping the ones that would change nothing.
 *
 * Takes the RGB alongside the index rather than looking it up: core has no
 * palette and shouldn't grow one — the caller already holds it.
 */
export function sceneColorOps(
  before: readonly SceneFields[],
  scenes: readonly number[],
  colorIndex: number,
  color: number,
): SceneWriteOp[] {
  const at = bySceneIndex(before);
  const out: SceneWriteOp[] = [];
  for (const s of scenes) {
    const prev = at.get(s);
    if (!prev || prev.colorIndex === colorIndex) continue;
    out.push({ s, colorIndex, color });
  }
  return out;
}

/**
 * Ops that put back whatever `ops` is about to overwrite, with the same three
 * exclusions as `inverseOps` — an unknown scene, a field the op never wrote,
 * and a write that changes nothing — plus one that's specific to scenes.
 *
 * **A scene that had no color at all cannot be restored to having none.** Live
 * documents `Scene.color_index` as "Can be None for no color" and Max's LiveAPI
 * can't construct that None to write it, so there is no such value to send. The
 * color revert is dropped rather than guessed at: painting slot 0 over it would
 * be an undo that changes the scene to a color it never had, which is worse
 * than an undo that leaves it alone. The name half still reverses, and callers
 * should say so rather than claim a clean undo.
 */
export function inverseSceneOps(
  before: readonly SceneFields[],
  ops: readonly SceneWriteOp[],
): SceneWriteOp[] {
  const at = bySceneIndex(before);
  const out: SceneWriteOp[] = [];
  for (const op of ops) {
    const prev = at.get(op.s);
    if (!prev) continue;

    const back: SceneWriteOp = { s: op.s };
    let changed = false;
    if (op.name !== undefined && op.name !== prev.name) {
      back.name = prev.name;
      changed = true;
    }
    if (
      op.colorIndex !== undefined &&
      op.colorIndex !== prev.colorIndex &&
      prev.colorIndex >= 0
    ) {
      back.colorIndex = prev.colorIndex;
      back.color = prev.color;
      changed = true;
    }
    if (changed) out.push(back);
  }
  return out;
}

/**
 * Whether reversing `ops` would leave a scene colored that had no color before.
 *
 * Separate from `inverseSceneOps` so the caller can *say* so. An undo that
 * silently does less than it claims is the failure mode this whole module is
 * written to avoid.
 */
export function countUnrevertableColors(
  before: readonly SceneFields[],
  ops: readonly SceneWriteOp[],
): number {
  const at = bySceneIndex(before);
  let n = 0;
  for (const op of ops) {
    const prev = at.get(op.s);
    if (prev && op.colorIndex !== undefined && prev.colorIndex < 0) n++;
  }
  return n;
}
