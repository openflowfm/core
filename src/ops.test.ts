import { describe, expect, it } from 'vitest';
import {
  applyOps,
  colorOps,
  inverseOps,
  type ClipFields,
  type ColoredClip,
} from './ops.js';

const clip = (t: number, s: number, name: string, colorIndex: number): ClipFields => ({
  t,
  s,
  name,
  colorIndex,
});

// Two clips in scene 0, one in scene 1. (1,1) is an empty slot throughout.
const BEFORE: ClipFields[] = [
  clip(0, 0, 'Kick A', 14),
  clip(1, 0, 'Arp Jam', 3),
  clip(0, 1, 'Kick B', 14),
];

describe('inverseOps', () => {
  it('restores the previous color', () => {
    const ops = [{ t: 0, s: 0, colorIndex: 41 }];
    expect(inverseOps(BEFORE, ops)).toEqual([{ t: 0, s: 0, colorIndex: 14 }]);
  });

  it('restores the previous name', () => {
    const ops = [{ t: 1, s: 0, name: 'Verse 1' }];
    expect(inverseOps(BEFORE, ops)).toEqual([{ t: 1, s: 0, name: 'Arp Jam' }]);
  });

  it('restores both fields when both were written', () => {
    const ops = [{ t: 0, s: 0, name: 'Chorus', colorIndex: 41 }];
    expect(inverseOps(BEFORE, ops)).toEqual([
      { t: 0, s: 0, name: 'Kick A', colorIndex: 14 },
    ]);
  });

  it('never reverts a field the op did not write', () => {
    // Color only, so the name must not appear — putting a name back that was
    // never touched would make undo destructive in its own right.
    const ops = [{ t: 0, s: 0, colorIndex: 41 }];
    expect(inverseOps(BEFORE, ops)[0]).not.toHaveProperty('name');
  });

  it('skips cells that held no clip', () => {
    // apply() skips an empty slot, so there is nothing to put back.
    const ops = [{ t: 1, s: 1, colorIndex: 41 }];
    expect(inverseOps(BEFORE, ops)).toEqual([]);
  });

  it('skips writes that change nothing', () => {
    const ops = [
      { t: 0, s: 0, colorIndex: 14 }, // already 14
      { t: 1, s: 0, name: 'Arp Jam' }, // already named that
    ];
    expect(inverseOps(BEFORE, ops)).toEqual([]);
  });

  it('reverts only the changed half of a mixed op', () => {
    const ops = [{ t: 0, s: 0, name: 'Kick A', colorIndex: 41 }];
    expect(inverseOps(BEFORE, ops)).toEqual([{ t: 0, s: 0, colorIndex: 14 }]);
  });

  it('round-trips a batch back to the original state', () => {
    const ops = [
      { t: 0, s: 0, colorIndex: 41 },
      { t: 1, s: 0, colorIndex: 41 },
      { t: 0, s: 1, colorIndex: 41 },
    ];
    const back = inverseOps(BEFORE, ops);
    expect(back).toEqual([
      { t: 0, s: 0, colorIndex: 14 },
      { t: 1, s: 0, colorIndex: 3 },
      { t: 0, s: 1, colorIndex: 14 },
    ]);
  });

  it('is empty for an empty batch', () => {
    expect(inverseOps(BEFORE, [])).toEqual([]);
  });
});

describe('colorOps', () => {
  it('writes every cell that would actually change', () => {
    const cells = [
      { t: 0, s: 0 },
      { t: 1, s: 0 },
    ];
    expect(colorOps(BEFORE, cells, 41)).toEqual([
      { t: 0, s: 0, colorIndex: 41 },
      { t: 1, s: 0, colorIndex: 41 },
    ]);
  });

  it('drops cells already that color', () => {
    const cells = [
      { t: 0, s: 0 }, // already 14
      { t: 1, s: 0 }, // 3
    ];
    expect(colorOps(BEFORE, cells, 14)).toEqual([{ t: 1, s: 0, colorIndex: 14 }]);
  });

  it('drops empty slots', () => {
    expect(colorOps(BEFORE, [{ t: 1, s: 1 }], 41)).toEqual([]);
  });

  it('is empty when the whole selection is already that color', () => {
    const cells = [
      { t: 0, s: 0 },
      { t: 0, s: 1 },
    ];
    expect(colorOps(BEFORE, cells, 14)).toEqual([]);
  });
});

describe('applyOps', () => {
  // A palette where the RGB is the index times a thousand, so an assertion can
  // say which slot was resolved rather than just that some number arrived.
  const rgb = (i: number) => (i === 99 ? undefined : i * 1000);

  const colored = (
    t: number,
    s: number,
    name: string,
    colorIndex: number,
  ): ColoredClip => ({ t, s, name, colorIndex, color: colorIndex * 1000 });

  const CLIPS: ColoredClip[] = [
    colored(0, 0, 'Kick A', 14),
    colored(1, 0, 'Arp Jam', 3),
    colored(0, 1, 'Kick B', 14),
  ];

  it('writes the name and leaves everything else', () => {
    const out = applyOps(CLIPS, [{ t: 1, s: 0, name: 'Verse 1' }], rgb);
    expect(out[1]).toEqual({
      t: 1,
      s: 0,
      name: 'Verse 1',
      colorIndex: 3,
      color: 3000,
    });
  });

  it('resolves the RGB for a written color', () => {
    const out = applyOps(CLIPS, [{ t: 0, s: 0, colorIndex: 41 }], rgb);
    expect(out[0].colorIndex).toBe(41);
    expect(out[0].color).toBe(41000);
  });

  it('keeps the old RGB when the palette has no such slot', () => {
    // Better a stale color than a confidently wrong one — and the caller should
    // be re-reading rather than reaching this at all.
    const out = applyOps(CLIPS, [{ t: 0, s: 0, colorIndex: 99 }], rgb);
    expect(out[0].colorIndex).toBe(99);
    expect(out[0].color).toBe(14000);
  });

  it('leaves untouched clips identical, not merely equal', () => {
    // The grid memoizes rows on clip identity; a fresh object for every clip
    // would re-render all of them on a one-cell write.
    const out = applyOps(CLIPS, [{ t: 0, s: 0, name: 'x' }], rgb);
    expect(out[1]).toBe(CLIPS[1]);
    expect(out[2]).toBe(CLIPS[2]);
  });

  it('does not mutate the input', () => {
    applyOps(CLIPS, [{ t: 0, s: 0, name: 'x', colorIndex: 41 }], rgb);
    expect(CLIPS[0]).toEqual(colored(0, 0, 'Kick A', 14));
  });

  it('carries extra fields through untouched', () => {
    const rich = [{ ...colored(0, 0, 'Kick A', 14), length: 4, isMidi: true }];
    const out = applyOps(rich, [{ t: 0, s: 0, name: 'Kick C' }], rgb);
    expect(out[0]).toEqual({
      t: 0,
      s: 0,
      name: 'Kick C',
      colorIndex: 14,
      color: 14000,
      length: 4,
      isMidi: true,
    });
  });

  it('lets a later op win over an earlier one on the same cell', () => {
    const out = applyOps(
      CLIPS,
      [
        { t: 0, s: 0, name: 'first' },
        { t: 0, s: 0, name: 'second' },
      ],
      rgb,
    );
    expect(out[0].name).toBe('second');
  });

  it('merges two ops that write different fields of one cell', () => {
    const out = applyOps(
      CLIPS,
      [
        { t: 0, s: 0, name: 'renamed' },
        { t: 0, s: 0, colorIndex: 41 },
      ],
      rgb,
    );
    expect(out[0]).toEqual({
      t: 0,
      s: 0,
      name: 'renamed',
      colorIndex: 41,
      color: 41000,
    });
  });

  it('ignores ops addressing an empty slot', () => {
    const out = applyOps(CLIPS, [{ t: 1, s: 1, name: 'nothing here' }], rgb);
    expect(out).toEqual(CLIPS);
  });

  it('returns a fresh array for no ops, so callers can set state with it', () => {
    const out = applyOps(CLIPS, [], rgb);
    expect(out).toEqual(CLIPS);
    expect(out).not.toBe(CLIPS);
  });
});
