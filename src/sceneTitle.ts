// The scene name convention, everything except the role tag.
//
//   Nightfall 128 Bm [chorus]
//   └── song ──┘ │   └ role ┘   (roles.ts owns the tag)
//        │       └ key
//        └ bpm
//
// Three parts, each optional, in that order. `roles.ts` owns the bracketed tag
// at the end; this owns what comes before it, and the two compose — `titleOps`
// rewrites the title and puts the scene's own role back on.
//
// **"song" here means a piece of music, not Live's `Song`.** The LOM's Song is
// the whole set, and `LaunchTarget { kind: 'song' }` in the protocol means the
// transport. The overload is pre-existing — `pattern.ts` has a `{song}` token
// and the README talks about "song segmentation" — so this follows the word
// already in use rather than inventing a second one. If it ever gets renamed,
// it should get renamed in all three places at once.
//
// Parsing is anchored at the *end* and never guesses in the middle. bpm and key
// are recognised only as trailing tokens of exactly the right shape, so
// "Arp Jam 2" keeps its whole title rather than having the 2 read as a tempo.
// The consequence worth relying on: **parse and format round-trip.** A title
// this can't decompose comes back byte-identical rather than rearranged, which
// is what makes it safe to run over a name nobody meant to restructure.

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
 * Split a title into its three parts, taking bpm and key off the end only.
 *
 * Anything it doesn't recognise stays in `song`, so a title that never followed
 * the convention survives a round trip untouched.
 */
export function parseTitle(title: string): SceneTitle {
  const words = title.trim().split(/\s+/).filter((w) => w !== '');
  let key = '';
  let bpm = '';
  if (words.length > 0 && KEY_RE.test(words[words.length - 1]!)) key = words.pop()!;
  if (words.length > 0 && BPM_RE.test(words[words.length - 1]!)) bpm = words.pop()!;
  return { song: words.join(' '), bpm, key };
}

/** The three parts back into a title, skipping the empty ones. */
export function formatTitle(t: SceneTitle): string {
  return [t.song, t.bpm, t.key]
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join(' ');
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
