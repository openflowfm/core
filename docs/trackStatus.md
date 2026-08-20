# trackStatus.ts

What a track's status display shows, from the clip currently playing in it.

Live's Session mixer draws one of these under every track. Its own help text names five
forms:

> a pie graph for looping Session clips, a min:sec timer for one-shots, a bars:beats
> count for recording, a miniaturized view of the Arrangement clips if the track is
> playing back the Arrangement, or a microphone or keyboard icon if a track is monitoring
> input.

**Three of those describe a playing clip, and this module covers those three.** They share
one source — the position of the one clip playing in the track — which is why they are one
function rather than three.

The other two are not derivable from a playing clip and are not implemented:

| form | why not |
|---|---|
| Arrangement miniature | needs every track's `arrangement_clips` and the arrangement playhead — a different, much larger read, for a view this app doesn't have |
| monitoring glyph | needs `current_monitoring_state`, which [`bridge/LOM.md`](../../bridge/LOM.md) does not list for the Live version this targets |

A track in either condition gets `null`, which draws nothing. That is deliberate: there is
no fourth kind meaning "something else is happening", because a status that reads as a
clip position while the track is actually monitoring input would be worse than a blank.

## The three forms

`trackStatus(clip, tempo)` takes a [`BSV.PlayingClip`](../../protocol/global.d.ts) — the
facts `lom.ts` reads off the playing clip — and Live's song tempo, and returns one of:

| kind | carries | when |
|---|---|---|
| `loop` | `phase`, 0–1 through the loop | the clip loops |
| `oneShot` | `secondsLeft` | it doesn't |
| `recording` | `bars`, `beats`, both counting from 1 | Live is recording into it |

`loopBars` answers the same question as the loop form, in words rather than as a
fraction: **which bar, of how many.** A pie wants the fraction; a reader with room for
text wants the count, because a four-bar loop and a sixteen-bar loop are the same arc at
the same phase and "five to go" is a subtraction rather than an estimate. It is null
wherever bars cannot mean anything — a clip that isn't looping, a loop with no length,
and unwarped audio, whose position Live reports in seconds.

Its bar total is **rounded, not floored**, and that is the one line worth defending. A
loop is a whole number of bars in every set anyone plays, but it arrives off the LOM as a
float, so an eight-beat loop can read 7.999. Flooring turns that into a one-bar loop —
wrong in a way that looks deliberate, which is worse than wrong. The current bar is
wrapped for the same reason the phase is: Live can report a position a hair past
`loop_end` between the wrap and the next frame, and bar 9 of 8 is nonsense.

`recording` outranks looping. A clip being recorded into is usually also a looping clip,
and its length so far is the thing you need while the take is running.

The countdown is time **left**, not time elapsed — Live's choice, and the right one: the
number you act on is how long until you have to fire the next thing.

## The units trap

Live gives `playing_position`, `loop_start` and `loop_end` **in beats for MIDI and warped
audio clips, and in seconds for unwarped audio**. Nothing in the values says which. Mixing
them doesn't fail — it produces a loop phase quietly wrong by the tempo, and a countdown
wrong by the same factor.

`PlayingClip.inSeconds` is the answer, resolved once in `lom.ts` from
`is_audio_clip && !warping`. Every consumer reads that flag rather than guessing from the
magnitudes.

`tempo` is used for exactly one thing: turning a one-shot's remaining **beats** into
seconds. An unwarped clip's remaining time is already in seconds and ignores it.

## What returns `null`

Cases where the numbers can't mean what a display would imply:

- a loop with no length (`loop_end <= loop_start`) — there is no fraction to be through
- a non-finite position or marker
- a recording clip whose times are in seconds — it has no bars to count

Drawing a full pie or `0:00` for those would be a confident lie about a clip that is
playing perfectly well.

A position slightly past `loop_end` **wraps** rather than clamping. Live has been seen to
report one between the loop wrap and the next frame, and a phase above 1 would draw a
wedge further round than full.

## Where it's used

`ui/src/hooks/useTrackStatus.ts` runs it per track per frame and stores the *result*, so a
frame in which no pie visibly moved wakes no component. Nine numbers reduced to two or
three is what makes that comparison cheap enough to do at 20 Hz. See
[`ui/docs/mixer.md`](../../ui/docs/mixer.md) for the display, and
[`bridge/docs/message-protocol.md`](../../bridge/docs/message-protocol.md) for how the
facts get here.
