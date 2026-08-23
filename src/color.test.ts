import { describe, expect, it } from 'vitest';
import { brightness, contrast, hex, inkOn, legibleOn, luminance } from './color.ts';

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

  /* The colors below are real entries from Live's 70-color palette, and each
     one is a place the old WCAG-luminance rule disagreed with Live. They're
     here as a regression net: the failure mode is "labels went white again on
     half the set", which is only visible with Live open. */
  it('puts black on the saturated mid-tones Live puts black on', () => {
    expect(inkOn(0x3dc300)).toBe('#141417'); // green
    expect(inkOn(0x00bfaf)).toBe('#141417'); // teal
    expect(inkOn(0xa9a9a9)).toBe('#141417'); // mid grey
    expect(inkOn(0xd3ad71)).toBe('#141417'); // tan
    expect(inkOn(0xf66c03)).toBe('#141417'); // orange
    expect(inkOn(0xff39d4)).toBe('#141417'); // magenta
  });

  it('keeps white on the genuinely dark entries', () => {
    expect(inkOn(0x1a2f96)).toBe('#f2f2f4'); // navy
    expect(inkOn(0x3c3c3c)).toBe('#f2f2f4'); // dark grey
    expect(inkOn(0x724f41)).toBe('#f2f2f4'); // brown
    expect(inkOn(0xaf3333)).toBe('#f2f2f4'); // dark red
    expect(inkOn(0x624bad)).toBe('#f2f2f4'); // purple
  });
});

describe('brightness', () => {
  it('rates a saturated green far above its WCAG luminance', () => {
    // The disagreement this function exists for: linearising drags mid-tones
    // down, and this green is the one that made every label on the set white.
    expect(brightness(0x3dc300)).toBeGreaterThan(0.5);
    expect(luminance(0x3dc300)).toBeLessThan(0.45);
  });

  it('weights green over red over blue, and spans 0..1', () => {
    expect(brightness(0x00ff00)).toBeGreaterThan(brightness(0xff0000));
    expect(brightness(0xff0000)).toBeGreaterThan(brightness(0x0000ff));
    expect(brightness(0xffffff)).toBeCloseTo(1, 5);
    expect(brightness(0x000000)).toBe(0);
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
