import { describe, expect, it } from 'vitest';
import { LIVE_PALETTE } from './livePalette.ts';

describe('the embedded Live palette', () => {
  it('contains the complete, distinct 14 × 5 color table', () => {
    expect(LIVE_PALETTE).toHaveLength(70);
    expect(new Set(LIVE_PALETTE).size).toBe(70);
  });

  it('keeps the picker boundaries pinned', () => {
    expect(LIVE_PALETTE[0]).toBe(0xff94a6);
    expect(LIVE_PALETTE[13]).toBe(0xffffff);
    expect(LIVE_PALETTE[56]).toBe(0xaf3333);
    expect(LIVE_PALETTE[69]).toBe(0x3c3c3c);
  });
});
