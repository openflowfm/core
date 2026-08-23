import { describe, expect, it } from 'vitest';
import {
  buildColumns,
  groupsOf,
  membersOf,
  startsBand,
  type GroupableTrack,
} from './trackColumns.ts';

/** `G` marks a group track; the number is its parent index, -1 for none. */
function mk(spec: Array<[string, boolean, number]>): GroupableTrack[] {
  return spec.map(([name, isGroup, groupIndex], i) => ({ i, name, isGroup, groupIndex }));
}

// Pads(0) > [Sparkle(1), Beating(2)] ; Drums(3) > [Kick(4)] ; Vox(5) ungrouped
const FLAT = mk([
  ['Pads', true, -1],
  ['Sparkle', false, 0],
  ['Beating', false, 0],
  ['Drums', true, -1],
  ['Kick', false, 3],
  ['Vox', false, -1],
]);

// Outer(0) > [ Inner(1) > [Deep(2)], Shallow(3) ]
const NESTED = mk([
  ['Outer', true, -1],
  ['Inner', true, 0],
  ['Deep', false, 1],
  ['Shallow', false, 0],
]);

const names = (cols: ReturnType<typeof buildColumns<GroupableTrack>>) =>
  cols.map((c) => (c.kind === 'track' ? c.track.name : `[${c.group.name}]`));

describe('buildColumns', () => {
  it('gives every group a column of its own, ahead of its members', () => {
    expect(names(buildColumns(FLAT, new Set()))).toEqual([
      '[Pads]',
      'Sparkle',
      'Beating',
      '[Drums]',
      'Kick',
      'Vox',
    ]);
  });

  it('bands each column with the group it sits in, and a group with itself', () => {
    const groups = buildColumns(FLAT, new Set()).map((c) => c.group?.name ?? null);
    expect(groups).toEqual(['Pads', 'Pads', 'Pads', 'Drums', 'Drums', null]);
  });

  it('uses the immediate group for a nested open track', () => {
    const cols = buildColumns(NESTED, new Set());
    // [Outer] [Inner] Deep Shallow — Deep's band is Inner, not Outer.
    expect(names(cols)).toEqual(['[Outer]', '[Inner]', 'Deep', 'Shallow']);
    expect(cols[2]?.group?.name).toBe('Inner');
    expect(cols[3]?.group?.name).toBe('Outer');
  });

  it('keeps the group column and hides its members when collapsed', () => {
    expect(names(buildColumns(FLAT, new Set([0])))).toEqual([
      '[Pads]',
      '[Drums]',
      'Kick',
      'Vox',
    ]);
  });

  it('carries the hidden member indexes, and says it is collapsed', () => {
    const [pads] = buildColumns(FLAT, new Set([0]));
    expect(pads.kind).toBe('group');
    if (pads.kind === 'group') {
      expect(pads.members).toEqual([1, 2]);
      expect(pads.collapsed).toBe(true);
    }
  });

  it('carries members on an expanded group too — the cell counts them either way', () => {
    const [pads] = buildColumns(FLAT, new Set());
    expect(pads.kind).toBe('group');
    if (pads.kind === 'group') {
      expect(pads.members).toEqual([1, 2]);
      expect(pads.collapsed).toBe(false);
    }
  });

  it('collapses several groups independently', () => {
    expect(names(buildColumns(FLAT, new Set([0, 3])))).toEqual([
      '[Pads]',
      '[Drums]',
      'Vox',
    ]);
  });

  it('hides a nested group entirely when an ancestor is collapsed', () => {
    // Inner is itself a group; collapsing Outer must not leave it behind.
    expect(names(buildColumns(NESTED, new Set([0])))).toEqual(['[Outer]']);
  });

  it('collapses an inner group without touching its siblings', () => {
    expect(names(buildColumns(NESTED, new Set([1])))).toEqual([
      '[Outer]',
      '[Inner]',
      'Shallow',
    ]);
  });

  it('reaches through nesting for the members a collapsed outer group stands for', () => {
    const [outer] = buildColumns(NESTED, new Set([0]));
    // Deep is two levels down and Inner is a group, so members is [Deep, Shallow].
    if (outer.kind === 'group') expect(outer.members).toEqual([2, 3]);
  });

  it('survives a cyclic parent link instead of hanging', () => {
    const cyclic = mk([
      ['A', true, 1],
      ['B', true, 0],
      ['C', false, 0],
    ]);
    expect(() => buildColumns(cyclic, new Set([9]))).not.toThrow();
  });
});

describe('membersOf', () => {
  it('reaches through nesting to every non-group descendant', () => {
    expect(membersOf(NESTED, NESTED[0])).toEqual([2, 3]);
    expect(membersOf(NESTED, NESTED[1])).toEqual([2]);
  });

  it('is empty for a group with nothing in it', () => {
    expect(membersOf(mk([['Empty', true, -1]]), mk([['Empty', true, -1]])[0])).toEqual([]);
  });
});

describe('startsBand', () => {
  it('starts a band at each group column and nowhere inside it', () => {
    const cols = buildColumns(FLAT, new Set());
    // [Pads] Sparkle Beating [Drums] Kick Vox
    expect(cols.map((_, i) => startsBand(cols, i))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it('does not band an ungrouped column', () => {
    const tracks = mk([
      ['A', false, -1],
      ['B', false, -1],
    ]);
    const cols = buildColumns(tracks, new Set());
    expect(cols.map((_, i) => startsBand(cols, i))).toEqual([false, false]);
  });

  it('starts a fresh band for a nested group rather than continuing its parent', () => {
    const cols = buildColumns(NESTED, new Set());
    // [Outer] [Inner] Deep Shallow — Inner opens its own run, and Shallow
    // reopens Outer's after it, so both are starts.
    expect(cols.map((_, i) => startsBand(cols, i))).toEqual([true, true, false, true]);
  });

  it('is false past the end', () => {
    expect(startsBand(buildColumns(FLAT, new Set()), 99)).toBe(false);
  });
});

describe('groupsOf', () => {
  it('returns group tracks in track order', () => {
    expect(groupsOf(FLAT).map((t) => t.name)).toEqual(['Pads', 'Drums']);
  });
});
