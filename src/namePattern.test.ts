import { describe, expect, it } from 'vitest';
import {
  compilePattern,
  DEFAULT_SCENE_PATTERN,
  describePatternError,
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
    expect(DEFAULT_SCENE_PATTERN).toBe('{song} {bpm?} {key?} [{role?}]');
    expect(patternErrors(DEFAULT_SCENE_PATTERN)).toEqual([]);
    expect(compilePattern(DEFAULT_SCENE_PATTERN)).not.toBeNull();
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

describe('the shipped convention: {song} {bpm?} {key?} [{role?}]', () => {
  const c = compile(FULL);

  it('writes a full name', () => {
    expect(c.format({ song: 'Nightfall', bpm: '128', key: 'Bm', role: 'chorus' })).toBe(
      'Nightfall 128 Bm [chorus]',
    );
  });

  it('reads a full name back', () => {
    expect(c.parse('Nightfall 128 Bm [chorus]')).toEqual({
      song: 'Nightfall',
      bpm: '128',
      key: 'Bm',
      role: 'chorus',
    });
  });

  it('keeps a multi-word song together', () => {
    expect(c.parse('Glass Tunnel 124 F#m [post chorus]')).toEqual({
      song: 'Glass Tunnel',
      bpm: '124',
      key: 'F#m',
      role: 'post chorus',
    });
  });

  it('drops a missing role and its brackets, not just the value', () => {
    // "Nightfall 128 Bm []" would be the naive result, and it wouldn't parse.
    expect(c.format({ song: 'Nightfall', bpm: '128', key: 'Bm' })).toBe(
      'Nightfall 128 Bm',
    );
  });

  it('drops missing bpm and key without leaving a double space', () => {
    expect(c.format({ song: 'Nightfall', role: 'chorus' })).toBe('Nightfall [chorus]');
  });

  it('fills as many parts as it can rather than swallowing them into the song', () => {
    // The stated resolution rule. "Nightfall 128" is also a legal song name,
    // and this is why it isn't read as one.
    expect(c.parse('Nightfall 128')).toEqual({ song: 'Nightfall', bpm: '128' });
    expect(c.parse('Nightfall Bm')).toEqual({ song: 'Nightfall', key: 'Bm' });
    expect(c.parse('Nightfall [chorus]')).toEqual({ song: 'Nightfall', role: 'chorus' });
  });

  it('reads a song that never followed the convention as all song', () => {
    expect(c.parse('Arp Jam 2')).toEqual({ song: 'Arp Jam 2' });
    expect(c.parse('Audio 3')).toEqual({ song: 'Audio 3' });
  });

  it('round-trips every shape sceneTitle.ts handles today', () => {
    const names = [
      'Nightfall 128 Bm [chorus]',
      'Glass Tunnel 124 F#m [post chorus]',
      'Nightfall 128 Bm',
      'Nightfall 128',
      'Nightfall Bm',
      'Nightfall [verse]',
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
    expect(c.format({ song: 'Nightfall', bpm: 128 })).toBe('Nightfall 128');
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
    expect(compile(FULL).tokens).toEqual([
      { name: 'song', optional: false },
      { name: 'bpm', optional: true },
      { name: 'key', optional: true },
      { name: 'role', optional: true },
    ]);
  });
});
