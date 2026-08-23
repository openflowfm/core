import { describe, expect, it } from 'vitest';
import { EMPTY_GROUP_SLOT, groupSlot, type SlotClip } from './groupSlot.ts';

/** A clip lookup over `track -> color`. */
const at = (m: Record<number, number>) => (t: number): SlotClip | undefined =>
  m[t] === undefined ? undefined : { color: m[t] };

describe('groupSlot', () => {
  it('counts only the members holding a clip', () => {
    expect(groupSlot([1, 2, 3], at({ 1: 0xff0000, 3: 0x00ff00 })).count).toBe(2);
  });

  it('takes its color from the first member with a clip, not the lowest color', () => {
    // 2 comes first in the group even though 5 is a "smaller" color value.
    expect(groupSlot([2, 5], at({ 2: 0xff0000, 5: 0x0000ff })).color).toBe(0xff0000);
  });

  it('reads first in the order given, not in numeric track order', () => {
    // membersOf returns track order; if a caller ever hands them over
    // reversed, the color follows the list it was given.
    expect(groupSlot([5, 2], at({ 2: 0xff0000, 5: 0x0000ff })).color).toBe(0x0000ff);
  });

  it('skips leading members with nothing, and colors from the first that has one', () => {
    expect(groupSlot([1, 2, 3], at({ 3: 0x123456 }))).toEqual({ count: 1, color: 0x123456 });
  });

  it('reports -1 rather than a color when the group has nothing here', () => {
    expect(groupSlot([1, 2], at({})).color).toBe(-1);
    expect(groupSlot([1, 2], at({}))).toBe(EMPTY_GROUP_SLOT);
  });

  it('is empty for a group with no members at all', () => {
    expect(groupSlot([], at({ 1: 0xffffff }))).toBe(EMPTY_GROUP_SLOT);
  });

  it('treats black as a real color rather than as absent', () => {
    // 0 is a legitimate RGB and must not collapse into the -1 "no color" case.
    expect(groupSlot([1], at({ 1: 0x000000 }))).toEqual({ count: 1, color: 0 });
  });
});
