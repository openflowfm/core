import { describe, expect, it } from 'vitest';
import { planClipMove, type ClipAt, type ClipMoveTrack } from './clipMove.js';

/** Four MIDI tracks, then two audio, then a group at 6. */
const TRACKS: ClipMoveTrack[] = [
  { i: 0, isGroup: false, isMidi: true },
  { i: 1, isGroup: false, isMidi: true },
  { i: 2, isGroup: false, isMidi: true },
  { i: 3, isGroup: false, isMidi: true },
  { i: 4, isGroup: false, isMidi: false },
  { i: 5, isGroup: false, isMidi: false },
  { i: 6, isGroup: true, isMidi: false },
];

const at = (t: number, s: number): ClipAt => ({ t, s });

const plan = (
  sources: ClipAt[],
  dt: number,
  ds: number,
  clips: ClipAt[] = sources,
  sceneCount = 10,
) => planClipMove({ sources, dt, ds, sceneCount, tracks: TRACKS, clips });

/** `from -> to` for each step, in order. */
const order = (p: ReturnType<typeof plan>) =>
  p!.steps.map((x) => `${x.fromT}:${x.fromS}->${x.toT}:${x.toS}`);

describe('planClipMove', () => {
  it('moves one clip', () => {
    const p = plan([at(0, 0)], 1, 2)!;
    expect(order(p)).toEqual(['0:0->1:2']);
    expect(p.remove).toEqual([at(0, 0)]);
    expect(p.clips).toBe(1);
  });

  it('refuses a drop back where it started', () => {
    expect(plan([at(0, 0)], 0, 0)).toBeNull();
  });

  it('refuses an empty drag', () => {
    expect(plan([], 1, 1)).toBeNull();
  });

  describe('ordering — no clip is overwritten before it is copied out', () => {
    it('runs the far end first when moving down', () => {
      // 5->6 must not run before 6->7, or step two reads what step one wrote.
      expect(order(plan([at(0, 5), at(0, 6)], 0, 1)!)).toEqual([
        '0:6->0:7',
        '0:5->0:6',
      ]);
    });

    it('runs the near end first when moving up', () => {
      expect(order(plan([at(0, 5), at(0, 6)], 0, -1)!)).toEqual([
        '0:5->0:4',
        '0:6->0:5',
      ]);
    });

    it('orders by track when the drag is purely sideways', () => {
      expect(order(plan([at(1, 0), at(2, 0)], 1, 0)!)).toEqual([
        '2:0->3:0',
        '1:0->2:0',
      ]);
      expect(order(plan([at(1, 0), at(2, 0)], -1, 0)!)).toEqual([
        '1:0->0:0',
        '2:0->1:0',
      ]);
    });

    it('lets the scene axis decide when the drag moves on both', () => {
      // Diagonal by (+1,+1): (0,0)->(1,1) and (1,1)->(2,2). The second source
      // sits on the first's target, so it has to be copied out first.
      expect(order(plan([at(0, 0), at(1, 1)], 1, 1)!)).toEqual([
        '1:1->2:2',
        '0:0->1:1',
      ]);
    });

    it('never writes a slot it has still to read, over a long overlapping run', () => {
      const sources = [0, 1, 2, 3, 4, 5].map((s) => at(0, s));
      const p = plan(sources, 0, 2)!;
      const read = new Set<string>();
      const written = new Set<string>();
      for (const step of p.steps) {
        // The source must not already have been clobbered by an earlier write.
        expect(written.has(`${step.fromT}:${step.fromS}`)).toBe(false);
        read.add(`${step.fromT}:${step.fromS}`);
        written.add(`${step.toT}:${step.toS}`);
      }
      expect(p.steps).toHaveLength(6);
    });
  });

  describe('what gets cleared afterwards', () => {
    it('keeps a source that something else landed on', () => {
      // (0,5) and (0,6) shift down one. (0,6) is a target, so only (0,5) clears.
      const p = plan([at(0, 5), at(0, 6)], 0, 1)!;
      expect(p.remove).toEqual([at(0, 5)]);
    });

    it('clears every source when the block moves clear of itself', () => {
      const p = plan([at(0, 0), at(0, 1)], 0, 5)!;
      expect(p.remove).toEqual([at(0, 0), at(0, 1)]);
    });
  });

  describe('overwrites', () => {
    it('counts an occupied target that is not itself moving', () => {
      const p = plan([at(0, 0)], 0, 1, [at(0, 0), at(0, 1)])!;
      expect(p.overwrites).toBe(1);
    });

    it('does not count a target that is leaving too', () => {
      // Both move down one; (0,1) is a target but it's also a source.
      const p = plan([at(0, 0), at(0, 1)], 0, 1, [at(0, 0), at(0, 1)])!;
      expect(p.overwrites).toBe(0);
    });

    it('is zero when every target is empty', () => {
      expect(plan([at(0, 0)], 0, 5, [at(0, 0)])!.overwrites).toBe(0);
    });
  });

  describe('refusals — whole, never partial', () => {
    it('refuses a target past the end of the set', () => {
      expect(plan([at(0, 9)], 0, 1, [at(0, 9)], 10)).toBeNull();
    });

    it('refuses a target above the first scene', () => {
      expect(plan([at(0, 0)], 0, -1)).toBeNull();
    });

    it('refuses a target off the end of the tracks', () => {
      expect(plan([at(5, 0)], 2, 0)).toBeNull();
    });

    it('refuses a target on a group track', () => {
      expect(plan([at(5, 0)], 1, 0)).toBeNull();
    });

    it('refuses MIDI onto an audio track', () => {
      expect(plan([at(3, 0)], 1, 0)).toBeNull();
    });

    it('refuses audio onto a MIDI track', () => {
      expect(plan([at(4, 0)], -1, 0)).toBeNull();
    });

    it('refuses the whole drag when only one clip of many is invalid', () => {
      // (0,0) is a fine move; (3,0) would land on audio. Neither runs — a
      // partial plan is what half-destroys a set.
      expect(plan([at(0, 0), at(3, 0)], 1, 0)).toBeNull();
    });
  });
});
