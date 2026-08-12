# `clipMove.ts`

A clip drag is a **rigid translation**: every clip picked up moves by
the same `(dt, ds)`, and that is what makes the ordering problem solvable. Live has no
move, so this is copy-then-delete like the scene reorder, which means the copies can
clobber each other — moving a block down one scene, `(t,5) → (t,6)` before
`(t,6) → (t,7)` destroys the clip the second step was going to read. Copies run against
the direction of travel, far end first, and one comparator covers it: if a source sits on
another source's target it is exactly one offset further along, so sorting that way
always puts it first. The scene axis decides whenever `ds` is non-zero; the track axis
only breaks ties for a purely sideways drag.

Deletes come last, all of them, after every copy — a failure partway then leaves clips
copied and originals intact, which is the recoverable direction. Only sources nothing
landed on are cleared; a source that is also someone's target now holds the moved clip.

**An invalid target refuses the whole drag rather than being dropped from it.**
`duplicate_clip_to` raises on a group slot and on a type mismatch, and a raise partway
through leaves the set half-moved. `null` is the only answer that can't half-destroy
something. It also counts `overwrites` — occupied targets that aren't themselves moving —
because Live overwrites silently and the count is what lets the UI say so first.

`applyClipMove` is the drag's answer to `applyOps`: where the clips end up, so a drop
doesn't cost a walk of the whole set. It **replays the steps in plan order** rather than
remapping them in one pass, and that's the whole reason it isn't a one-liner — the order
`orderSteps` chose is what keeps a block from eating its own tail, and any other order
here would model a set Live never produces.
