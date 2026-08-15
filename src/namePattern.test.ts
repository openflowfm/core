import { describe, expect, it } from 'vitest';
import {
  compilePattern,
  DEFAULT_SCENE_PATTERN,
  describePatternError,
  LEADING_TAG_SCENE_PATTERN,
  LEGACY_SCENE_PATTERN,
  patternErrors,
  SCENE_TOKENS,
  type TokenRegistry,
} from './namePattern.js';

/**
 * The convention the app writes today. Deliberately the exported constant and
 * not a copy of it — `App.tsx` compiles this at module scope with a `!`, so
 * "it compiles" has to be something a test actually holds down.
 */
const FULL = DEFAULT_SCENE_PATTERN;

const compile = (p: string, r?: TokenRegistry) => {
  const c = compilePattern(p, r);
  if (!c) throw new Error(`${p} — ${patternErrors(p, r).map(describePatternError).join('; ')}`);
  return c;
};

describe('accepting and rejecting patterns', () => {
  it('compiles the default scene pattern — App.tsx asserts this with a !', () => {
    expect(DEFAULT_SCENE_PATTERN).toBe(
      '([{role}])? (@{bpm?}-{key?})? {song} ( - {artist})? ({{tag}})?',
    );
    expect(patternErrors(DEFAULT_SCENE_PATTERN)).toEqual([]);
    expect(compilePattern(DEFAULT_SCENE_PATTERN)).not.toBeNull();
  });

  it('still compiles the short-lived leading-tag convention', () => {
    expect(LEADING_TAG_SCENE_PATTERN).toBe('([{role}])? ({{tag}})? (@{key?})? {song}');
    expect(patternErrors(LEADING_TAG_SCENE_PATTERN)).toEqual([]);
  });

  it('still compiles the legacy pattern — existing sets are named that way', () => {
    // Retiring this would make every scene in an already-named set unmapped the
    // moment the convention changed, leaving nothing to select in order to
    // rename it. `derive.ts` falls back to it, so it has to keep working.
    expect(LEGACY_SCENE_PATTERN).toBe('{song} {bpm?} {key?} [{role?}]');
    expect(patternErrors(LEGACY_SCENE_PATTERN)).toEqual([]);
    expect(compilePattern(LEGACY_SCENE_PATTERN)).not.toBeNull();
  });

  it('accepts the shapes the scheme is built on', () => {
    for (const p of [
      '{song}',
      '{song} {bpm} {key}',
      '{bpm} {key} {song}',
      '{song} [{role}]',
      FULL,
      '{song} - {bpm}',
    ]) {
      expect(patternErrors(p), p).toEqual([]);
    }
  });

  it('rejects two free tokens separated only by a space — the undecidable case', () => {
    const reg: TokenRegistry = {
      ...SCENE_TOKENS,
      label: { shape: '.+', free: true, samples: ['Arp', 'Glass Tunnel'] },
    };
    const errs = patternErrors('{song} {label}', reg);
    expect(errs).toEqual([{ kind: 'two-free-tokens', a: 'song', b: 'label' }]);
    // The message has to say what to do about it, not just that it's wrong.
    expect(describePatternError(errs[0]!)).toContain(' - ');
  });

  it('allows two free tokens once a literal separates them', () => {
    const reg: TokenRegistry = {
      ...SCENE_TOKENS,
      label: { shape: '.+', free: true, samples: ['Arp', 'Glass Tunnel'] },
    };
    expect(patternErrors('{song} - {label}', reg)).toEqual([]);
    const c = compile('{song} - {label}', reg);
    expect(c.parse('Glass Tunnel - Arp Jam')).toEqual({
      song: 'Glass Tunnel',
      label: 'Arp Jam',
    });
  });

  it('rejects a pattern with no tokens', () => {
    expect(patternErrors('just words')).toEqual([{ kind: 'no-tokens' }]);
  });

  it('rejects an unknown token, and says so before anything else', () => {
    expect(patternErrors('{song} {wat}')).toEqual([
      { kind: 'unknown-token', token: 'wat' },
    ]);
  });

  it('rejects a repeated token', () => {
    expect(patternErrors('{song} {bpm} {song}')).toContainEqual({
      kind: 'duplicate-token',
      token: 'song',
    });
  });

  it('rejects a free token run together with another', () => {
    expect(patternErrors('{song}{bpm}')).toContainEqual({
      kind: 'run-together',
      a: 'song',
      b: 'bpm',
    });
  });

  it('rejects an optional free token', () => {
    expect(patternErrors('{bpm} {song?}')).toContainEqual({
      kind: 'optional-free',
      token: 'song',
    });
  });

  it('rejects an optional token with nothing before it to drop', () => {
    expect(patternErrors('{bpm?} {song}')).toContainEqual({
      kind: 'optional-first',
      token: 'bpm',
    });
  });
});

describe('the shipped convention: ([{role}])? (@{bpm?}-{key?})? {song} ( - {artist})? ({{tag}})?', () => {
  const c = compile(FULL);

  it('writes and reads the artist behind its separator', () => {
    expect(
      c.format({ song: 'Nightfall', artist: 'The Aviators', key: 'Bm', role: 'chorus' }),
    ).toBe('[chorus] @Bm Nightfall - The Aviators');
    expect(c.parse('[chorus] @Bm Nightfall - The Aviators {COVER}')).toEqual({
      song: 'Nightfall',
      artist: 'The Aviators',
      tag: 'COVER',
      key: 'Bm',
      role: 'chorus',
    });
  });

  it('drops the separator with the artist', () => {
    expect(c.format({ song: 'Nightfall', tag: 'COVER' })).toBe('Nightfall {COVER}');
  });

  it('splits at the first separator — the lazy {song} rule, stated', () => {
    // Two free fields in one string can only be split by their separator, and
    // the reading that fills the most parts wins. A song genuinely called
    // "Sunday - Bloody Sunday" is the price, and it's why the separator is the
    // thing worth making configurable.
    expect(c.parse('Sunday - Bloody Sunday - The Band')).toEqual({
      song: 'Sunday',
      artist: 'Bloody Sunday - The Band',
    });
  });

  it('needs the spaces, so a hyphenated title stays whole', () => {
    expect(c.parse('Twenty-One')).toEqual({ song: 'Twenty-One' });
  });

  it('writes a full name', () => {
    expect(c.format({ song: 'Nightfall', tag: 'COVER', bpm: '128', key: 'Bm', role: 'chorus' })).toBe(
      '[chorus] @128-Bm Nightfall {COVER}',
    );
  });

  it('reads a full name back', () => {
    expect(c.parse('[chorus] @128-Bm Nightfall {COVER}')).toEqual({
      song: 'Nightfall',
      tag: 'COVER',
      bpm: '128',
      key: 'Bm',
      role: 'chorus',
    });
  });

  it('keeps a multi-word song together', () => {
    expect(c.parse('[post chorus] @F#m Glass Tunnel')).toEqual({
      song: 'Glass Tunnel',
      key: 'F#m',
      role: 'post chorus',
    });
  });

  it('drops a missing role and its brackets, not just the value', () => {
    // "[] @128-Bm Nightfall" would be the naive result, and it wouldn't parse.
    expect(c.format({ song: 'Nightfall', bpm: '128', key: 'Bm' })).toBe(
      '@128-Bm Nightfall',
    );
  });

  it('reads and drops the whole literal-braced tag group', () => {
    expect(c.format({ song: 'Nightfall', tag: 'ORIGINAL' })).toBe(
      'Nightfall {ORIGINAL}',
    );
    expect(c.parse('Nightfall {ORIGINAL}')).toEqual({
      song: 'Nightfall',
      tag: 'ORIGINAL',
    });
    expect(c.format({ song: 'Nightfall' })).toBe('Nightfall');
  });

  it('accepts tags beyond the editor suggestions', () => {
    expect(c.parse('Nightfall {LATE NIGHT}')).toEqual({
      song: 'Nightfall',
      tag: 'LATE NIGHT',
    });
  });

  it('drops the whole @ group when it has nothing to say', () => {
    expect(c.format({ song: 'Nightfall', role: 'chorus' })).toBe('[chorus] Nightfall');
    expect(c.format({ song: 'Nightfall' })).toBe('Nightfall');
  });

  it('drops the separator with whichever fact is missing', () => {
    expect(c.format({ song: 'Nightfall', bpm: '128', key: 'Bm' })).toBe('@128-Bm Nightfall');
    expect(c.format({ song: 'Nightfall', bpm: '128' })).toBe('@128 Nightfall');
    expect(c.format({ song: 'Nightfall', key: 'Bm' })).toBe('@Bm Nightfall');
    expect(c.format({ song: 'Nightfall' })).toBe('Nightfall');
  });

  it('is a strict superset of the key-only convention it replaced', () => {
    // The key-only spelling is byte-identical, which is what lets a set written
    // under the previous convention keep parsing without being renamed.
    expect(c.parse('[chorus] @Bm Nightfall - The Aviators {COVER}')).toEqual({
      song: 'Nightfall',
      artist: 'The Aviators',
      tag: 'COVER',
      key: 'Bm',
      role: 'chorus',
    });
  });

  it('reads the facts back unambiguously', () => {
    expect(c.parse('@Bm Nightfall')).toEqual({ song: 'Nightfall', key: 'Bm' });
    expect(c.parse('@128 Nightfall')).toEqual({ song: 'Nightfall', bpm: '128' });
    expect(c.parse('@128-Bm Nightfall')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
    });
  });

  // Two shapes this app cannot write — bpm is validated 20–999 and a song name
  // is required — pinned so a later change to the group has to notice them
  // rather than discover them on a set someone typed by hand in Live.
  it('reads a four-digit bpm greedily, leaving the rest in the song', () => {
    expect(c.parse('@1000-Bm Nightfall')).toEqual({
      song: '0-Bm Nightfall',
      bpm: '100',
    });
  });

  it('gives the song its one required character out of a facts-only name', () => {
    expect(c.parse('@128-Bm')).toEqual({ song: 'm', bpm: '128', key: 'B' });
  });

  it('reads a song that never followed the convention as all song', () => {
    expect(c.parse('Arp Jam 2')).toEqual({ song: 'Arp Jam 2' });
    expect(c.parse('Audio 3')).toEqual({ song: 'Audio 3' });
    // No @, so nothing here is a fact — "Em Dash" is a title, not a key.
    expect(c.parse('Em Dash')).toEqual({ song: 'Em Dash' });
  });

  it('round-trips every shape the convention can produce', () => {
    const names = [
      '[chorus] @128-Bm Nightfall {COVER}',
      '[chorus] @Bm Nightfall {COVER}',
      'Glass Tunnel {ORIGINAL}',
      '[chorus] @128-Bm Nightfall',
      '[post chorus] @92-F#m Glass Tunnel',
      '@128-Bm Nightfall',
      '@128 Nightfall',
      '@Bm Nightfall',
      '[verse] Nightfall',
      'Nightfall',
      'Arp Jam 2',
      'Audio 3',
    ];
    for (const name of names) {
      const parsed = c.parse(name);
      expect(parsed, name).not.toBeNull();
      expect(c.format(parsed!), name).toBe(name);
    }
  });

  it('never returns a partial parse — a name either matches or it does not', () => {
    // A half-read name would attach a scene to the wrong song, which is worse
    // than not attaching it at all.
    expect(c.parse('')).toBeNull();
  });
});

describe('the legacy convention: {song} {bpm?} {key?} [{role?}]', () => {
  // Still compiled and still parsed, because an existing set is named this way
  // and derivation is how the app finds its songs at all.
  const c = compile(LEGACY_SCENE_PATTERN);

  it('reads a full name back', () => {
    expect(c.parse('Nightfall 128 Bm [chorus]')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
      role: 'chorus',
    });
  });

  it('fills as many parts as it can rather than swallowing them into the song', () => {
    expect(c.parse('Nightfall 128')).toEqual({ song: 'Nightfall', bpm: '128' });
    expect(c.parse('Nightfall Bm')).toEqual({ song: 'Nightfall', key: 'Bm' });
  });

  it('round-trips every shape it ever wrote', () => {
    for (const name of [
      'Nightfall 128 Bm [chorus]',
      'Glass Tunnel 124 F#m [post chorus]',
      'Nightfall 128 Bm',
      'Nightfall 128',
      'Nightfall Bm',
      'Nightfall [verse]',
      'Nightfall',
      'Arp Jam 2',
    ]) {
      const parsed = c.parse(name);
      expect(parsed, name).not.toBeNull();
      expect(c.format(parsed!), name).toBe(name);
    }
  });
});

describe('optional groups', () => {
  it('takes its own delimiters out with it', () => {
    // The failure that forced groups to exist: an optional token absorbs the
    // literal *before* it, and the one after it only at the very end of the
    // pattern — so a bracketed field mid-name strands its closing bracket.
    const loose = compile('[{role?}] {song}');
    expect(loose.format({ song: 'Nightfall' })).toBe('] Nightfall');

    const grouped = compile('([{role}])? {song}');
    expect(grouped.format({ song: 'Nightfall' })).toBe('Nightfall');
    expect(grouped.format({ song: 'Nightfall', role: 'chorus' })).toBe(
      '[chorus] Nightfall',
    );
  });

  it('keeps an edge literal but drops an internal separator', () => {
    const c = compile('(@{bpm?}-{key?})? {song}');
    expect(c.format({ song: 'X', bpm: '128', key: 'Bm' })).toBe('@128-Bm X');
    expect(c.format({ song: 'X', bpm: '128' })).toBe('@128 X'); // '-' is a separator
    expect(c.format({ song: 'X', key: 'Bm' })).toBe('@Bm X');
    expect(c.format({ song: 'X' })).toBe('X'); // '@' goes with the group
  });

  it('rejects a free token in a group with nothing to open it', () => {
    // Absent and empty are indistinguishable for free text with no separator,
    // group or no group. A bracket around it changes nothing.
    expect(patternErrors('({song})? {bpm}')).toContainEqual({
      kind: 'optional-free',
      token: 'song',
    });
  });

  it('allows one once the group brings its own separator', () => {
    // The group's `" - "` is what says where the artist starts, and it leaves
    // with the artist — which is the whole reason groups exist. Same rule as
    // `{song} - {label}` being allowed where `{song} {label}` is not.
    expect(patternErrors('{song} ( - {artist})?')).toEqual([]);
    const c = compile('{song} ( - {artist})?');
    expect(c.parse('Glass Tunnel - Sun & Steel')).toEqual({
      song: 'Glass Tunnel',
      artist: 'Sun & Steel',
    });
    expect(c.parse('Glass Tunnel')).toEqual({ song: 'Glass Tunnel' });
  });

  it('treats an unclosed ( as a literal rather than failing to compile', () => {
    const c = compile('{song} (live)');
    expect(c.format({ song: 'Nightfall' })).toBe('Nightfall (live)');
  });
});

describe('parse', () => {
  const c = compile('{song} {bpm} {key}');

  it('is null when the name does not match the pattern', () => {
    expect(c.parse('Nightfall')).toBeNull();
    expect(c.parse('Nightfall 128')).toBeNull();
    expect(c.parse('Nightfall 1 Bm')).toBeNull(); // bpm is 2-3 digits
  });

  it('does not take bpm or key out of the middle of a song name', () => {
    expect(c.parse('Nightfall Bm 128 Bm')).toEqual({
      song: 'Nightfall Bm',
      bpm: '128',
      key: 'Bm',
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(c.parse('  Nightfall 128 Bm  ')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
    });
  });
});

describe('format', () => {
  const c = compile(FULL);

  it('accepts numbers as well as strings', () => {
    expect(c.format({ song: 'Nightfall', bpm: 128 })).toBe('@128 Nightfall');
  });

  it('treats null, undefined and blank the same way', () => {
    expect(c.format({ song: 'Nightfall', bpm: null, key: undefined, role: '  ' })).toBe(
      'Nightfall',
    );
  });

  it('is empty when nothing is supplied', () => {
    expect(c.format({})).toBe('');
  });
});

describe('the probe', () => {
  it('catches an unbracketed role — which is why the tag has brackets', () => {
    // No structural rule sees this: `role` is shape-constrained, so it isn't
    // the two-free-tokens case. But its shape allows spaces, so against a
    // free `{song}` there's nothing to split on. The probe finds it, and this
    // is the entire justification for `[{role}]` over a bare trailing word.
    const errs = patternErrors('{song} {role}');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.kind).toBe('no-round-trip');
    expect(describePatternError(errs[0]!)).toContain("doesn't survive its own round trip");
  });

  it('only finds it on the second sample set, which is why there are two', () => {
    // One-word samples round-trip fine: "Nightfall chorus" splits correctly.
    // It's ('Glass Tunnel', 'post chorus') that breaks it, so a single sample
    // would have waved this pattern through.
    const oneWord: TokenRegistry = {
      ...SCENE_TOKENS,
      song: { shape: '.+', free: true, samples: ['Nightfall', 'Daybreak'] },
      role: { ...SCENE_TOKENS.role!, samples: ['chorus', 'verse'] },
    };
    expect(patternErrors('{song} {role}', oneWord)).toEqual([]);
    expect(patternErrors('{song} {role}', SCENE_TOKENS)[0]?.kind).toBe('no-round-trip');
  });

  it('lets a shape-constrained pair run together when it really is reversible', () => {
    // "128Bm" splits only one way, so this is allowed where {song}{bpm} is not.
    expect(patternErrors('{bpm}{key}')).toEqual([]);
    expect(compile('{bpm}{key}').parse('128Bm')).toEqual({ bpm: '128', key: 'Bm' });
  });

  it('allows an ugly pattern that is nonetheless reversible', () => {
    // The stray "]" lands in the same place writing and reading, so this does
    // round-trip. The probe judges reversibility, not taste — a pattern the
    // author regrets is their business, one the app can't read back is not.
    expect(patternErrors('{song} [{role?}] {bpm}')).toEqual([]);
    const c = compile('{song} [{role?}] {bpm}');
    expect(c.format({ song: 'Nightfall', bpm: '128' })).toBe('Nightfall] 128');
    expect(c.parse('Nightfall] 128')).toEqual({ song: 'Nightfall', bpm: '128' });
  });
});

describe('compilePattern', () => {
  it('is null for a pattern with errors', () => {
    expect(compilePattern('{song} {wat}')).toBeNull();
  });

  it('reports the tokens it found, in order, with their optionality', () => {
    // Pattern order, so the capture groups line up with it. A token inside an
    // optional group reports as optional however it's written — the group is
    // what makes it droppable.
    expect(compile(FULL).tokens).toEqual([
      { name: 'role', optional: true },
      { name: 'bpm', optional: true },
      { name: 'key', optional: true },
      { name: 'song', optional: false },
      { name: 'artist', optional: true },
      { name: 'tag', optional: true },
    ]);
  });
});
