import { describe, expect, it } from 'vitest';
import { hex, inkOn, luminance } from './color.js';

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
