// The scene name convention, everything except the role tag.
//
//   [CHORUS] @128-Bm NIGHTFALL - THE AVIATORS {COVER}
//    └ role┘  │   │   └ song ┘   └ artist ┘   └ tag┘   (roles.ts owns the role)
//            bpm  └ key
//
// `roles.ts` owns the bracketed tag at the front; this owns what follows it, and
// the two compose — `titleOps` rewrites the title and puts the scene's own role
// back on.
//
// **Role first, facts and name next, song tag last.** Live's narrow scene column
// keeps the performance metadata in view and truncates the app-only catalog
// tag first. Our grid parses each field into its own dedicated presentation.
//
// `@` opens the facts from the front — it can't appear in a role and won't start
// a title, so the group is identifiable without a closing delimiter. The `-`
// between bpm and key drops with either of them, so `@128-Bm`, `@128` and `@Bm`
// are all one shape.
//
// **BPM is a label, and writing it changes nothing about playback.** It used to
// live only on Live's `Scene.tempo`, and that made mixing into the middle of a
// song impossible — Live takes a scene's own tempo the moment that scene fires,
// so every scene of a 128 song snapped the set to 128 however fast it was
// already running. The name is the record; projecting it onto the song's first
// scene is a separate, deliberate action in `roles.ts`.
//
// **The artist is optional and separated by `" - "`.** Song and artist are both
// free text, so the separator is the only thing that can say where one stops —
// which is the same rule `namePattern.ts` applies to `{song} - {label}`. The
// split takes the **first** separator, matching that file's lazy `{song}`, and
// the two have to keep agreeing: this parser feeds the editor and the compiled
// one feeds derivation, and a name that reads differently in the two would show
// one song in the grid and rename a different one.
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
// Parsing never guesses in the middle: the tag is read only from literal braces
// at the tail and the facts only from a leading `@` group,
// so "Arp Jam 2" keeps its whole title rather than having the 2 read as a tempo,
// and "Em Dash" keeps its whole title rather than having "Em" read as a key.
// The consequence worth relying on:
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
} from './roles.ts';
import { isSongTag, SONG_TAG_SHAPE } from './songTags.ts';

export interface SceneTitle {
  song: string;
  /**
   * Who plays it, written after the song behind `" - "`. `''` when the name
   * doesn't say.
   *
   * **A fact about the song, not part of its identity** — `songKey` still folds
   * only the name, so two scenes naming different artists for one song are a
   * disagreement the songs list reports, exactly like two keys. That follows
   * the split the scheme is built on: the *library* is authoritative for what a
   * song is, and the set states it.
   */
  artist: string;
  /** Open song-level classification written inside literal braces. */
  tag: string;
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

const TRAILING_TAG_RE = new RegExp(`\\s*\\{(${SONG_TAG_SHAPE})\\}$`);
/** Compatibility for scenes written during the leading-tag iteration. */
const LEADING_TAG_RE = new RegExp(`^\\{(${SONG_TAG_SHAPE})\\}(?=\\s|$)`);

export function isBpm(s: string): boolean {
  return BPM_RE.test(s.trim());
}

export function isKey(s: string): boolean {
  return KEY_RE.test(s.trim());
}

export function isTag(s: string): boolean {
  return isSongTag(s);
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
 * What separates the song from who plays it.
 *
 * Spaces on both sides are load-bearing: a hyphen alone is a character song
 * titles use (`Twenty-One`), and requiring the spaces keeps those whole.
 */
export const ARTIST_SEPARATOR = ' - ';

/**
 * Split `SONG - ARTIST`, at the **first** separator.
 *
 * First rather than last, because `namePattern.ts` matches `{song}` lazily and
 * the two parsers have to agree — so `A - B - C` is song `A` by artist `B - C`
 * in both. An empty half means the separator wasn't one (`- NIGHTFALL`), and
 * the whole thing stays the song rather than being torn in two.
 */
function splitArtist(text: string): { song: string; artist: string } {
  const at = text.indexOf(ARTIST_SEPARATOR);
  if (at < 0) return { song: text, artist: '' };
  const song = text.slice(0, at).trim();
  const artist = text.slice(at + ARTIST_SEPARATOR.length).trim();
  return song === '' || artist === '' ? { song: text, artist: '' } : { song, artist };
}

/**
 * True when a song name would be torn in two by its own separator.
 *
 * The editors ask this before writing: a song called `SUNDAY - BLOODY SUNDAY`
 * reads back as a song by an artist, and refusing it at the field is the only
 * point where someone can still do something about it.
 */
export function splitsAsArtist(song: string): boolean {
  return splitArtist(song.trim()).artist !== '';
}

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
 * Split a title into its song tag, song, artist, bpm and key.
 *
 * Reads a literal-braced tag from the tail, then an `@` group from the front,
 * then the artist off the back of what's left. It also accepts the short-lived
 * leading-tag order. Failing the `@` group it falls back to the **oldest**
 * convention's trailing `128 Bm`, so a set named that way still shows its
 * metadata while it migrates. Formatting always writes the tag last.
 *
 * The artist split runs last on both paths, so it composes with every form
 * rather than being a fourth convention of its own.
 *
 * Anything it doesn't recognise stays in `song`, so a title that never followed
 * either convention survives.
 */
export function parseTitle(title: string): SceneTitle {
  let rest = title.trim();
  let tagged = TRAILING_TAG_RE.exec(rest);
  if (tagged) rest = rest.slice(0, tagged.index).trim();
  else {
    tagged = LEADING_TAG_RE.exec(rest);
    if (tagged) rest = rest.slice(tagged[0].length).trim();
  }
  const tag = (tagged?.[1] ?? '').toUpperCase();

  const facts = FACTS_RE.exec(rest);
  if (facts && (facts[1] !== undefined || facts[2] !== undefined)) {
    return {
      ...splitArtist(rest.slice(facts[0].length).trim()),
      tag,
      bpm: facts[1] ?? '',
      key: facts[2] ?? '',
    };
  }

  const words = rest.split(/\s+/).filter((w) => w !== '');
  const { bpm, key } = takeTrailingFacts(words);
  return { ...splitArtist(words.join(' ')), tag, bpm, key };
}

/**
 * The fields back into a title, spelled exactly as `DEFAULT_SCENE_PATTERN`
 * spells them — the two have to agree, since one writes the names and the
 * compiled other reads them back.
 *
 * The `-` between bpm and key is a **separator**: it only means anything when
 * both sides are there, so it drops with either, and `@128`, `@Bm` and
 * `@128-Bm` all come out of the same two lines. That elision is what makes this
 * shape a strict superset of the key-only convention that preceded it — a scene
 * with no bpm is written byte-for-byte as it was — so no set needs renaming to
 * keep parsing.
 *
 * The song is uppercased here, which is the only place it happens — identity is
 * `songKey`, which folds case, so this is presentation and can't fork a song in
 * the library. The artist is uppercased with it: it sits in the same run of
 * text and is read case-insensitively too, so a mixed-case one would only make
 * the column look ragged.
 *
 * **An artist with no song is dropped**, because the convention can't express
 * one — `" - THE AVIATORS"` reads back as a song called that. Writing a name
 * this file would then re-read differently is the one failure it exists to
 * prevent, so the unwritable half goes rather than the round trip.
 */
export function formatTitle(t: SceneTitle): string {
  const bpm = t.bpm.trim();
  const key = t.key.trim();
  const tag = t.tag.trim().toUpperCase();
  const song = t.song.trim().toUpperCase();
  const artist = t.artist.trim().toUpperCase();
  const named = song !== '' && artist !== '' ? `${song}${ARTIST_SEPARATOR}${artist}` : song;
  const facts = bpm === '' && key === '' ? '' : `@${[bpm, key].filter((p) => p !== '').join('-')}`;
  return [facts, named, tag ? `{${tag}}` : '']
    .filter((p) => p !== '')
    .join(' ');
}

/** `t` with the patch's present fields replaced. */
export function patchTitle(t: SceneTitle, patch: TitlePatch): SceneTitle {
  return {
    song: patch.song === undefined ? t.song : patch.song.trim(),
    artist: patch.artist === undefined ? t.artist : patch.artist.trim(),
    tag: patch.tag === undefined ? t.tag : patch.tag.trim().toUpperCase(),
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
  artist: string | null;
  tag: string | null;
  bpm: string | null;
  key: string | null;
} {
  const agree = (pick: (t: SceneTitle) => string): string | null => {
    if (titles.length === 0) return null;
    const first = pick(titles[0]!);
    return titles.every((t) => pick(t) === first) ? first : null;
  };
  return {
    song: agree((t) => t.song),
    artist: agree((t) => t.artist),
    tag: agree((t) => t.tag),
    bpm: agree((t) => t.bpm),
    key: agree((t) => t.key),
  };
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
