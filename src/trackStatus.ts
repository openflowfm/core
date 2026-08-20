// What a track's status display shows, from the clip currently playing in it.
//
// Live's own Session mixer draws one of these under every track, and the help
// text names five forms. Three of them describe a clip that is playing, and all
// three fall out of the same four facts about that one clip — where the
// playhead is, where the loop ends, whether it loops, and whether it is being
// recorded into. Those three are what this covers.
//
// The other two are not derivable from a playing clip. A miniature of the
// track's Arrangement clips needs the whole arrangement; the input-monitoring
// glyph needs `current_monitoring_state`, which `bridge/LOM.md` does not list
// for the Live version this project targets. Neither is read, so neither is
// represented here — a status this module cannot state is `null` rather than a
// fourth kind meaning "something else is going on".

export type TrackStatus =
  /** A looping clip, as the fraction of its loop already played. */
  | { kind: 'loop'; phase: number }
  /**
   * A clip that runs once, as the time left before it ends. Live shows a
   * countdown here rather than an elapsed time, which is the number that
   * matters when you are waiting to fire the next thing.
   */
  | { kind: 'oneShot'; secondsLeft: number }
  /** A clip being recorded into, as how much of it exists so far. */
  | { kind: 'recording'; bars: number; beats: number };

/** Live counts beats in quarter notes whatever the signature says. */
function beatsPerBar(numerator: number, denominator: number): number {
  if (!(numerator > 0) || !(denominator > 0)) return 4;
  return (numerator * 4) / denominator;
}

function secondsFromBeats(beats: number, tempo: number): number {
  if (!(tempo > 0)) return 0;
  return (beats * 60) / tempo;
}

/**
 * What to draw for one playing clip, or `null` when there is nothing to say.
 *
 * `null` covers the cases where the numbers cannot mean what the display would
 * imply: a loop with no length can't have a phase, and a clip whose markers are
 * behind its playhead can't have a countdown. Drawing a full pie or `0:00` for
 * those would be a confident lie about a clip that is playing perfectly well.
 *
 * `tempo` is Live's song tempo, needed only to put a one-shot's remaining beats
 * into seconds.
 */
export function trackStatus(clip: BSV.PlayingClip, tempo: number): TrackStatus | null {
  const { position, loopStart, loopEnd } = clip;
  if (!isFinite(position) || !isFinite(loopStart) || !isFinite(loopEnd)) return null;

  const elapsed = Math.max(0, position - loopStart);

  if (clip.recording) {
    // Bars and beats both count from 1, the way Live's own transport reads:
    // a clip one beat into its first bar is 1.2, not 0.1.
    const perBar = beatsPerBar(clip.signatureNumerator, clip.signatureDenominator);
    // An unwarped audio clip's position is in seconds, so it has no bars to
    // count. Live cannot record into one either, but the guard costs nothing
    // and the alternative is a bar number derived from seconds.
    if (clip.inSeconds || !(perBar > 0)) return null;
    return {
      kind: 'recording',
      bars: Math.floor(elapsed / perBar) + 1,
      beats: Math.floor(elapsed % perBar) + 1,
    };
  }

  const span = loopEnd - loopStart;
  if (!(span > 0)) return null;

  if (clip.looping) {
    // Live has been seen to report a position a hair past loop_end between the
    // wrap and the next frame, and a phase above 1 draws a pie further round
    // than full. Wrapping rather than clamping keeps it continuous there.
    const phase = (elapsed % span) / span;
    return { kind: 'loop', phase };
  }

  const left = Math.max(0, loopEnd - position);
  return {
    kind: 'oneShot',
    secondsLeft: clip.inSeconds ? left : secondsFromBeats(left, tempo),
  };
}

/**
 * Where a looping clip is in bars: which bar, of how many.
 *
 * `trackStatus` answers the same question as a fraction, which is what a pie
 * wants. A reader that has room for words wants the count instead — "bar 3 of
 * 8" says both how far in you are *and* how long the loop is, and five to go is
 * a subtraction rather than an estimate off an arc. A four-bar loop and a
 * sixteen-bar loop look identical at the same phase.
 *
 * `bar` counts from 1, matching `trackStatus`'s recording form and Live's own
 * transport: a clip one beat in is in bar 1, not bar 0.
 *
 * Null where bars cannot mean anything — a clip that is not looping, a loop
 * with no length, or **unwarped audio**, whose position Live reports in seconds
 * and which therefore has no bars to count however the signature reads.
 */
export function loopBars(clip: BSV.PlayingClip): { bar: number; bars: number } | null {
  if (!clip.looping || clip.inSeconds) return null;
  const { position, loopStart, loopEnd } = clip;
  if (!isFinite(position) || !isFinite(loopStart) || !isFinite(loopEnd)) return null;

  const span = loopEnd - loopStart;
  if (!(span > 0)) return null;

  const perBar = beatsPerBar(clip.signatureNumerator, clip.signatureDenominator);
  if (!(perBar > 0)) return null;

  // Rounded, not floored: a loop is a whole number of bars in every set anyone
  // plays, and float positions off the LOM make an exact 8 arrive as 7.999.
  // Flooring turns that into a 7-bar loop, which is worse than wrong — it is
  // wrong in a way that looks deliberate.
  const bars = Math.max(1, Math.round(span / perBar));
  // Wrapped for the reason the phase is: Live can report a position a hair past
  // `loop_end` between the wrap and the next frame, and bar 9 of 8 is nonsense.
  const elapsed = Math.max(0, position - loopStart) % span;
  return { bar: Math.min(bars, Math.floor(elapsed / perBar) + 1), bars };
}

/**
 * A one-shot's countdown, as Live writes it: `m:ss`, rounded up.
 *
 * Up rather than down so the display reaches `0:00` as the clip ends rather
 * than a second before it, which is the second you would have acted on.
 */
export function formatSecondsLeft(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.ceil(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

/** A recording clip's length so far, as Live writes it: `bars.beats`. */
export function formatBarsBeats(bars: number, beats: number): string {
  return `${bars}.${beats}`;
}
