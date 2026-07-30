import { describe, expect, it } from 'vitest';
import { parseId, parseIds, parseNum, parseObjectRef, parseStr } from './lomAtoms.js';

describe('parseIds', () => {
  it('extracts ids from the alternating atom list', () => {
    expect(parseIds(['id', 4, 'id', 5, 'id', 6])).toEqual([4, 5, 6]);
  });

  it('handles an empty list', () => {
    expect(parseIds([])).toEqual([]);
  });

  it('returns nothing for a shape it does not recognise, so callers can fall back', () => {
    expect(parseIds(undefined)).toEqual([]);
    expect(parseIds('id 4')).toEqual([]);
    expect(parseIds([4, 5, 6])).toEqual([]);
  });

  it('ignores a trailing "id" with no value', () => {
    expect(parseIds(['id', 4, 'id'])).toEqual([4]);
  });
});

describe('parseObjectRef', () => {
  it('returns the id of an occupied reference', () => {
    expect(parseObjectRef(['id', 12])).toBe(12);
  });

  it('returns 0 for a reference that resolved but holds nothing', () => {
    expect(parseObjectRef(['id', 0])).toBe(0);
  });

  // The whole point of this function: an unreadable cursor must not look like
  // an empty clip slot, which is what parseId collapsing both to 0 caused.
  it('returns -1 for a reply it cannot read, distinct from empty', () => {
    expect(parseObjectRef(undefined)).toBe(-1);
    expect(parseObjectRef([])).toBe(-1);
    expect(parseObjectRef(0)).toBe(-1);
    expect(parseObjectRef(['id'])).toBe(-1);
    expect(parseObjectRef([12])).toBe(-1);
    expect(parseObjectRef('id 12')).toBe(-1);
    expect(parseObjectRef(['id', 'nope'])).toBe(-1);
  });

  it('disagrees with parseId exactly where it matters', () => {
    expect(parseId([])).toBe(0);
    expect(parseObjectRef([])).toBe(-1);
  });
});

describe('parseId', () => {
  it('reads a single object reference', () => {
    expect(parseId(['id', 12])).toBe(12);
  });

  it('treats an empty slot as 0 — this is the occupancy test', () => {
    expect(parseId(['id', 0])).toBe(0);
    expect(parseId([])).toBe(0);
    expect(parseId(undefined)).toBe(0);
  });
});

describe('parseStr', () => {
  it('unwraps a single atom', () => {
    expect(parseStr(['Arp'])).toBe('Arp');
  });

  it('rejoins a name that arrived split across atoms', () => {
    expect(parseStr(['128', 'Bm', 'Arp', 'Jam', '1'])).toBe('128 Bm Arp Jam 1');
  });

  it('survives null and undefined', () => {
    expect(parseStr(undefined)).toBe('');
    expect(parseStr(null)).toBe('');
  });
});

describe('parseNum', () => {
  it('unwraps and coerces', () => {
    expect(parseNum([128])).toBe(128);
    expect(parseNum('120')).toBe(120);
  });

  it('collapses non-numeric to 0 rather than NaN', () => {
    expect(parseNum(['nonsense'])).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum([])).toBe(0);
  });
});
