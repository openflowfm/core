import { describe, expect, it } from 'vitest';
import {
  buildColumns,
  groupsOf,
  headerSpans,
  membersOf,
  type GroupableTrack,
} from './trackColumns.js';

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
  it('drops group tracks and keeps the rest in order when nothing is collapsed', () => {
    expect(names(buildColumns(FLAT, new Set()))).toEqual([
      'Sparkle',
      'Beating',
      'Kick',
      'Vox',
    ]);
  });

  it('replaces a collapsed group with one column and hides its members', () => {
    expect(names(buildColumns(FLAT, new Set([0])))).toEqual([
      '[Pads]',
      'Kick',
      'Vox',
    ]);
  });

  it('carries the hidden member indexes on the folded column', () => {
    const folded = buildColumns(FLAT, new Set([0]))[0];
    expect(folded.kind).toBe('folded');
    if (folded.kind === 'folded') expect(folded.members).toEqual([1, 2]);
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
    expect(names(buildColumns(NESTED, new Set([1])))).toEqual(['[Inner]', 'Shallow']);
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

describe('headerSpans', () => {
  it('spans each group over its columns and totals the column count', () => {
    const cols = buildColumns(FLAT, new Set());
    const spans = headerSpans(FLAT, cols);
    expect(spans.map((s) => [s.group?.name ?? null, s.span])).toEqual([
      ['Pads', 2],
      ['Drums', 1],
      [null, 1],
    ]);
    expect(spans.reduce((n, s) => n + s.span, 0)).toBe(cols.length);
  });

  it('merges consecutive ungrouped columns into one span', () => {
    const tracks = mk([
      ['A', false, -1],
      ['B', false, -1],
    ]);
    expect(headerSpans(tracks, buildColumns(tracks, new Set()))).toEqual([
      { group: null, span: 2 },
    ]);
  });

  it('headers a folded column by its parent, not by itself', () => {
    // Inner folded: its own name is the column label, so the header above it
    // must be Outer rather than Inner repeated.
    const cols = buildColumns(NESTED, new Set([1]));
    expect(headerSpans(NESTED, cols).map((s) => [s.group?.name ?? null, s.span])).toEqual([
      ['Outer', 2],
    ]);
  });

  it('still totals the column count when groups are collapsed', () => {
    const cols = buildColumns(FLAT, new Set([0]));
    expect(headerSpans(FLAT, cols).reduce((n, s) => n + s.span, 0)).toBe(cols.length);
  });
});

describe('groupsOf', () => {
  it('returns group tracks in track order', () => {
    expect(groupsOf(FLAT).map((t) => t.name)).toEqual(['Pads', 'Drums']);
  });
});
