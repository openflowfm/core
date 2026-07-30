import { describe, expect, it } from 'vitest';
import { colorOps, inverseOps, type ClipFields } from './ops.js';

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
