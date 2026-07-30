import { describe, expect, it } from 'vitest';
import { parseSongTitle, render, tokensIn, unknownTokens } from './pattern.js';

describe('render', () => {
  it('substitutes known tokens', () => {
    expect(render('{bpm} {key} {label} {role}', { bpm: 128, key: 'Bm', label: 'Arp', role: 'Jam 1' })).toBe(
      '128 Bm Arp Jam 1',
    );
  });

  it('drops missing values and collapses the gap', () => {
    expect(render('{bpm} {key} {label}', { bpm: 128, label: 'Arp' })).toBe('128 Arp');
  });

  it('never writes an unresolved token into a name', () => {
    expect(render('{bpm} {nonsense} {label}', { bpm: 128, label: 'Arp' })).toBe('128 Arp');
  });

  it('leaves literal text alone', () => {
    expect(render('{label} — OUT', { label: 'Arp' })).toBe('Arp — OUT');
  });

  it('handles a repeated token', () => {
    expect(render('{n}/{n}', { n: 3 })).toBe('3/3');
  });

  it('returns empty for a pattern that resolves to nothing', () => {
    expect(render('{bpm} {key}', {})).toBe('');
  });
});

describe('tokensIn', () => {
  it('dedupes and preserves first-appearance order', () => {
    expect(tokensIn('{b} {a} {b}')).toEqual(['b', 'a']);
  });
});

describe('unknownTokens', () => {
  it('flags tokens the UI should warn about', () => {
    expect(unknownTokens('{bpm} {wat} {role}')).toEqual(['wat']);
  });
});

describe('parseSongTitle', () => {
  it('parses the convention the set already uses', () => {
    expect(parseSongTitle('128 Bm Arp')).toEqual({ bpm: 128, key: 'Bm', label: 'Arp' });
  });

  it('handles sharps and multi-word labels', () => {
    expect(parseSongTitle('124 F#m Glass Tunnel')).toEqual({
      bpm: 124,
      key: 'F#m',
      label: 'Glass Tunnel',
    });
  });

  it('returns nothing rather than guessing on a non-conforming title', () => {
    expect(parseSongTitle('Audio 3')).toEqual({});
    expect(parseSongTitle('')).toEqual({});
  });
});
