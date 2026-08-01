// The scene name convention, everything except the role tag.
//
//   [CHORUS] @128-Bm NIGHTFALL
//    └ role┘  │   │  └ song ┘    (roles.ts owns the tag)
//             │   └ key
//             └ bpm
//
// `roles.ts` owns the bracketed tag at the front; this owns what follows it, and
// the two compose — `titleOps` rewrites the title and puts the scene's own role
// back on.
//
// **Role first, facts second, name last**, so a column of scene names reads as
// structure rather than as a list of titles. The cost is that Live's own narrow
// scene column truncates the *name* rather than the metadata; our grid lifts the
// role into a chip, so it only bites in Live.
//
// The facts carry one delimiter each and neither is decoration. `@` opens the
// group from the front — it can't appear in a role and won't start a title, so
// the group is identifiable before you've read it, which is what makes a closing
// bracket unnecessary. `-` joins bpm to key and **drops with whichever is
// missing**, because after the `@` a digit begins a bpm and a letter begins a
// key: `@128-Bm`, `@128` and `@Bm` are all distinguishable with no further
// punctuation.
//
// **The song is written in caps and read case-insensitively.** `songKey` already
// folds case, so NIGHTFALL and Nightfall are one song and the uppercase is
// presentation, not identity — which is what stops a convention change from
// splitting the library in two.
//
// **"song" here means a piece of music, not Live's `Song`.** The LOM's Song is
// the whole set, and `LaunchTarget { kind: 'song' }` in the protocol means the
// transport. The overload is pre-existing — `pattern.ts` has a `{song}` token
// and the README talks about "song segmentation" — so this follows the word
// already in use rather than inventing a second one. If it ever gets renamed,
// it should get renamed in all three places at once.
//
// Parsing is anchored at the *front* and never guesses in the middle: the facts
// are read only from a leading `@` group, so "Arp Jam 2" keeps its whole title
// rather than having the 2 read as a tempo, and "Em Dash" keeps its whole title
// rather than having "Em" read as a key. The consequence worth relying on:
// **parse and format round-trip** for anything already in the convention, and a
// title this can't decompose comes back with only its case changed rather than
// rearranged — which is what makes it safe to run over a name nobody meant to
// restructure.
//
// It also still reads the *old* convention's trailing `128 Bm`, because an
// existing set is named that way and `titleOps` has to be able to convert it.
// See `parseTitle`.

import {
  nameWithoutRole,
  roleIn,
  withRole,
  type SceneFields,
  type SceneWriteOp,
} from './roles.js';

export interface SceneTitle {
  song: string;
  /** Kept as a string, not a number: `''` is absent, and 0 is not a tempo. */
  bpm: string;
  key: string;
}

/**
 * A change to some parts of a title.
 *
 * **An omitted field is left alone; an empty string clears that part.** The
 * distinction is the whole point — selecting two songs' worth of scenes to set
 * one shared key must not flatten their different names, and that needs "don't
 * touch this" to be a different thing from "make this blank".
 */
export type TitlePatch = Partial<SceneTitle>;

/** Two or three digits. One digit would eat the 2 in "Arp Jam 2". */
const BPM_RE = /^\d{2,3}$/;

/** `A`–`G`, optional `#`/`b`, optional minor `m`: `Bm`, `F#m`, `Eb`, `A`. */
const KEY_RE = /^[A-G][#b]?m?$/;

export function isBpm(s: string): boolean {
  return BPM_RE.test(s.trim());
}

export function isKey(s: string): boolean {
  return KEY_RE.test(s.trim());
}

/**
 * The facts group: `@` then a bpm, a key, or both joined by `-`.
 *
 * Both sides optional and the hyphen optional with them, which is exactly what
 * makes the group need no closing bracket — the shapes can't be confused for
 * each other or for a title.
 */
const FACTS_RE = /^@(?:(\d{2,3}))?(?:-)?(?:([A-G][#b]?m?))?(?=\s|$)/;

/**
 * The old convention's trailing `… 128 Bm`, still read so a set can convert.
 *
 * Deliberately byte-for-byte the rule this file used to apply to every name —
 * it's a compatibility path, and a fallback that parses old names *differently*
 * from the code that wrote them is worse than not having one.
 */
function takeTrailingFacts(words: string[]): { bpm: string; key: string } {
  let key = '';
  let bpm = '';
  if (words.length > 0 && KEY_RE.test(words[words.length - 1]!)) key = words.pop()!;
  if (words.length > 0 && BPM_RE.test(words[words.length - 1]!)) bpm = words.pop()!;
  return { bpm, key };
}

/**
 * Split a title into its three parts.
 *
 * Reads a leading `@` group first. Failing that it falls back to the **old**
 * convention's trailing `128 Bm`, so a set named the previous way still shows
 * its facts and a rename converts it rather than silently dropping them.
 *
 * Anything it doesn't recognise stays in `song`, so a title that never followed
 * either convention survives.
 */
export function parseTitle(title: string): SceneTitle {
  const trimmed = title.trim();

  const facts = FACTS_RE.exec(trimmed);
  if (facts && (facts[1] !== undefined || facts[2] !== undefined)) {
    return {
      song: trimmed.slice(facts[0].length).trim(),
      bpm: facts[1] ?? '',
      key: facts[2] ?? '',
    };
  }

  const words = trimmed.split(/\s+/).filter((w) => w !== '');
  const { bpm, key } = takeTrailingFacts(words);
  return { song: words.join(' '), bpm, key };
}

/**
 * The three parts back into a title.
 *
 * The song is uppercased here, which is the only place it happens — identity is
 * `songKey`, which folds case, so this is presentation and can't fork a song in
 * the library.
 */
export function formatTitle(t: SceneTitle): string {
  const bpm = t.bpm.trim();
  const key = t.key.trim();
  const facts = bpm !== '' || key !== '' ? `@${bpm}${bpm && key ? '-' : ''}${key}` : '';
  return [facts, t.song.trim().toUpperCase()].filter((p) => p !== '').join(' ');
}

/** `t` with the patch's present fields replaced. */
export function patchTitle(t: SceneTitle, patch: TitlePatch): SceneTitle {
  return {
    song: patch.song === undefined ? t.song : patch.song.trim(),
    bpm: patch.bpm === undefined ? t.bpm : patch.bpm.trim(),
    key: patch.key === undefined ? t.key : patch.key.trim(),
  };
}

/**
 * What a set of titles agree on, field by field. `null` where they don't.
 *
 * This is what the fields prefill from, and `null` is why a mixed field can
 * show "leave as is" rather than picking one scene's answer and quietly
 * spreading it over the rest.
 */
export function commonTitle(titles: readonly SceneTitle[]): {
  song: string | null;
  bpm: string | null;
  key: string | null;
} {
  const agree = (pick: (t: SceneTitle) => string): string | null => {
    if (titles.length === 0) return null;
    const first = pick(titles[0]!);
    return titles.every((t) => pick(t) === first) ? first : null;
  };
  return { song: agree((t) => t.song), bpm: agree((t) => t.bpm), key: agree((t) => t.key) };
}

/** The title part of a scene's name — its own name with the role tag taken off. */
export function titleOf(sceneName: string): SceneTitle {
  return parseTitle(nameWithoutRole(sceneName));
}

/**
 * Name writes applying `patch` to each scene's title, keeping its own role.
 *
 * Scenes the patch wouldn't change are dropped, so "set the key on this song"
 * over eighteen scenes where twelve already say `Bm` writes six.
 */
export function titleOps(
  before: readonly SceneFields[],
  scenes: readonly number[],
  patch: TitlePatch,
): SceneWriteOp[] {
  const at = new Map<number, SceneFields>();
  for (const sc of before) at.set(sc.s, sc);

  const out: SceneWriteOp[] = [];
  for (const s of scenes) {
    const prev = at.get(s);
    if (!prev) continue;
    const next = withRole(
      formatTitle(patchTitle(titleOf(prev.name), patch)),
      roleIn(prev.name),
    );
    if (next === prev.name) continue;
    out.push({ s, name: next });
  }
  return out;
}
