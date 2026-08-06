// What a group track's clip slot shows at one scene.
//
// A group slot holds no clip of its own. Live still draws it as a launcher,
// because firing it fires every clip the group holds in that scene, and it
// paints it with the color of the first of those clips. Both of those are
// answerable from the clips we already have, so the grid renders group slots
// without the snapshot reading a single extra thing out of Live.
//
// The LOM does expose this directly — `ClipSlot.controls_other_clips` and the
// slot's own `color` — but only per slot, which is trackCount × sceneCount
// reads for something the snapshot can already derive. Deriving it costs
// nothing and keeps the walk the size it is.
//
// One known divergence: Live says "non-deactivated clips", and the snapshot
// doesn't carry a clip's activation state. A group whose only clip in a scene
// is deactivated reads as launchable here and is inert in Live. Firing it is
// still Live's own call on the real slot, so the set does the right thing —
// what's wrong is a launcher drawn on a slot that won't sound.

/** A clip, as far as a group slot is concerned. */
export interface SlotClip {
  color: number;
}

export interface GroupSlot {
  /** How many of the group's tracks hold a clip in this scene. */
  count: number;
  /**
   * The color Live paints the slot — its first clip's, reading down the
   * group's tracks in order. -1 when the group has nothing here, which is not
   * a color and must not be rendered as one.
   */
  color: number;
}

/** Nothing to launch. Shared so the empty case allocates nothing per cell. */
export const EMPTY_GROUP_SLOT: GroupSlot = { count: 0, color: -1 };

/**
 * What the group slot for `members` shows, given a lookup for the clip one of
 * those tracks holds in this scene.
 *
 * `members` is in track order and that order is load-bearing: it decides which
 * clip is "first" and therefore what color the slot takes, matching Live.
 */
export function groupSlot(
  members: readonly number[],
  clipAt: (track: number) => SlotClip | undefined,
): GroupSlot {
  let count = 0;
  let color = -1;
  for (const t of members) {
    const clip = clipAt(t);
    if (clip === undefined) continue;
    if (count === 0) color = clip.color;
    count++;
  }
  return count === 0 ? EMPTY_GROUP_SLOT : { count, color };
}
