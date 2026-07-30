import { describe, expect, it } from 'vitest';
import { contrast, hex, inkOn, legibleOn, luminance } from './color.js';

const PANEL = 0x0a0a0b; // --bg, what scene names are painted on

describe('hex', () => {
  it('pads short values', () => {
    expect(hex(0x00ff00)).toBe('#00ff00');
    expect(hex(0x000001)).toBe('#000001');
  });
  it('ignores an alpha byte if Live hands one over', () => {
    expect(hex(0xff112233)).toBe('#112233');
  });
});

describe('inkOn', () => {
  it('picks dark ink on light clips and light ink on dark ones', () => {
    expect(inkOn(0xffffff)).toBe('#141417');
    expect(inkOn(0x000000)).toBe('#f2f2f4');
  });
  it('is monotonic with luminance', () => {
    expect(luminance(0xffffff)).toBeGreaterThan(luminance(0x808080));
    expect(luminance(0x808080)).toBeGreaterThan(luminance(0x000000));
  });
});

describe('contrast', () => {
  it('spans the WCAG range and is symmetric', () => {
    expect(contrast(0xffffff, 0x000000)).toBeCloseTo(21, 5);
    expect(contrast(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(contrast(0x336699, 0x336699)).toBeCloseTo(1, 5);
  });
});

describe('legibleOn', () => {
  it('leaves a color that already has contrast alone', () => {
    expect(legibleOn(0xf0b23c, PANEL)).toBe(0xf0b23c);
  });

  it('lifts a color too dark to read on the panel', () => {
    const dark = 0x1a1a2e;
    expect(contrast(dark, PANEL)).toBeLessThan(4.5);
    expect(contrast(legibleOn(dark, PANEL), PANEL)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue recognisable rather than washing out to grey', () => {
    // A dark saturated red must still read as red once lifted.
    const lifted = legibleOn(0x330000, PANEL);
    const r = (lifted >> 16) & 0xff;
    const g = (lifted >> 8) & 0xff;
    const b = lifted & 0xff;
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('terminates on black, the worst case', () => {
    expect(contrast(legibleOn(0x000000, PANEL), PANEL)).toBeGreaterThanOrEqual(4.5);
  });

  it('never returns a color darker than it was given', () => {
    for (const c of [0x000000, 0x102030, 0x7f7f7f, 0xffffff]) {
      expect(luminance(legibleOn(c, PANEL))).toBeGreaterThanOrEqual(luminance(c));
    }
  });
});
