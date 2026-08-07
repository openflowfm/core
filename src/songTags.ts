/**
 * Song-tag syntax is open; these are suggestions, not the vocabulary.
 *
 * Kept separate from sceneTitle/namePattern so their hand-written and compiled
 * parsers share one shape without introducing a dependency cycle.
 */
export const SUGGESTED_SONG_TAGS = ['COVER', 'ORIGINAL', 'JAM'] as const;

/** Regex source for a value inside literal `{...}` delimiters. */
export const SONG_TAG_SHAPE = "[A-Za-z0-9][A-Za-z0-9 &'\\-]*";

const SONG_TAG_RE = new RegExp(`^(?:${SONG_TAG_SHAPE})$`);

export function isSongTag(value: string): boolean {
  return SONG_TAG_RE.test(value.trim());
}
