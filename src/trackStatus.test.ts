import { describe, expect, it } from 'vitest';
import { formatBarsBeats, formatSecondsLeft, trackStatus } from './trackStatus.js';

function clip(over: Partial<BSV.PlayingClip> = {}): BSV.PlayingClip {
  return {
    t: 0,
    position: 0,
    loopStart: 0,
    loopEnd: 4,
    looping: true,
    recording: false,
    inSeconds: false,
    signatureNumerator: 4,
    signatureDenominator: 4,
    ...over,
  };
}

describe('trackStatus — looping clips', () => {
  it('reports the fraction of the loop already played', () => {
    expect(trackStatus(clip({ position: 1 }), 120)).toEqual({ kind: 'loop', phase: 0.25 });
    expect(trackStatus(clip({ position: 3 }), 120)).toEqual({ kind: 'loop', phase: 0.75 });
  });

  it('measures from loop_start, not from the clip origin', () => {
    const status = trackStatus(clip({ loopStart: 8, loopEnd: 12, position: 9 }), 120);
    expect(status).toEqual({ kind: 'loop', phase: 0.25 });
  });

  it('wraps a position that has run past loop_end', () => {
    const status = trackStatus(clip({ loopEnd: 4, position: 5 }), 120);
    expect(status).toEqual({ kind: 'loop', phase: 0.25 });
  });

  it('has nothing to say about a loop with no length', () => {
    expect(trackStatus(clip({ loopStart: 4, loopEnd: 4 }), 120)).toBeNull();
    expect(trackStatus(clip({ loopStart: 8, loopEnd: 4 }), 120)).toBeNull();
  });
});

describe('trackStatus — one-shots', () => {
  it('counts down the beats left, converted at the song tempo', () => {
    // 3 beats left at 120bpm is 1.5s.
    const status = trackStatus(clip({ looping: false, loopEnd: 4, position: 1 }), 120);
    expect(status).toEqual({ kind: 'oneShot', secondsLeft: 1.5 });
  });

  it('takes an unwarped clip’s times as seconds already', () => {
    const status = trackStatus(
      clip({ looping: false, loopEnd: 30, position: 5, inSeconds: true }),
      120,
    );
    expect(status).toEqual({ kind: 'oneShot', secondsLeft: 25 });
  });

  it('never counts below zero', () => {
    const status = trackStatus(clip({ looping: false, loopEnd: 4, position: 6 }), 120);
    expect(status).toEqual({ kind: 'oneShot', secondsLeft: 0 });
  });
});

describe('trackStatus — recording', () => {
  it('counts bars and beats from one', () => {
    expect(trackStatus(clip({ recording: true, position: 0 }), 120)).toEqual({
      kind: 'recording',
      bars: 1,
      beats: 1,
    });
    expect(trackStatus(clip({ recording: true, position: 5 }), 120)).toEqual({
      kind: 'recording',
      bars: 2,
      beats: 2,
    });
  });

  it('reads bar length from the clip’s own signature', () => {
    // 6/8 is six eighth notes, which is three of Live's quarter-note beats.
    const status = trackStatus(
      clip({ recording: true, position: 4, signatureNumerator: 6, signatureDenominator: 8 }),
      120,
    );
    expect(status).toEqual({ kind: 'recording', bars: 2, beats: 2 });
  });

  it('outranks looping — a clip being recorded into reports its length', () => {
    const status = trackStatus(clip({ recording: true, looping: true, position: 2 }), 120);
    expect(status).toEqual({ kind: 'recording', bars: 1, beats: 3 });
  });

  it('has no bars to count when the clip’s times are in seconds', () => {
    expect(trackStatus(clip({ recording: true, inSeconds: true }), 120)).toBeNull();
  });
});

describe('trackStatus — bad input', () => {
  it('says nothing rather than drawing a guess', () => {
    expect(trackStatus(clip({ position: NaN }), 120)).toBeNull();
    expect(trackStatus(clip({ loopEnd: Infinity }), 120)).toBeNull();
  });

  it('survives a tempo Live never reports', () => {
    const status = trackStatus(clip({ looping: false, position: 0 }), 0);
    expect(status).toEqual({ kind: 'oneShot', secondsLeft: 0 });
  });
});

describe('formatSecondsLeft', () => {
  it('writes minutes and padded seconds', () => {
    expect(formatSecondsLeft(25)).toBe('0:25');
    expect(formatSecondsLeft(9)).toBe('0:09');
    expect(formatSecondsLeft(60)).toBe('1:00');
    expect(formatSecondsLeft(125)).toBe('2:05');
  });

  it('rounds up, so 0:00 means the clip has ended', () => {
    expect(formatSecondsLeft(0.2)).toBe('0:01');
    expect(formatSecondsLeft(0)).toBe('0:00');
  });

  it('floors at zero', () => {
    expect(formatSecondsLeft(-5)).toBe('0:00');
    expect(formatSecondsLeft(NaN)).toBe('0:00');
  });
});

describe('formatBarsBeats', () => {
  it('joins them the way Live’s transport reads', () => {
    expect(formatBarsBeats(1, 1)).toBe('1.1');
    expect(formatBarsBeats(12, 3)).toBe('12.3');
  });
});
