# `songOrder.ts`

What a running order means in scenes, which is the input
`planSceneReorder` needs. Two rules, both falling out of **a song being a label rather than
a range**:

- **A song is one entry, so applying an order gathers it.** A song found in two runs is one
  line of a set list and comes out as one run. That's a real change — the reprise stops
  being one — so whatever renders this has to say so before it writes.
- **A scene no song owns travels with the song it sits after**, and stays at the top of the
  set if no song precedes it. It isn't in the running order and can't be placed by one, and
  the obvious alternative — pinning it to the index it holds now — cuts a song in half as
  soon as the songs above it change length.

It is deliberately **total**: a stale order that omits a song appends it rather than
dropping it, and a song the set no longer carries is ignored. Every scene comes out exactly
once whatever the caller passes, because `planSceneReorder` refuses anything else and being
refused is not a useful answer to give someone who just pressed Apply.

The same module owns the pure hierarchical song sorter used to build that running order.
Each level only breaks ties left by the level above it, so `Tag ↑ → Key ↑ → BPM ↓ →
Name ↑` produces tag groups, key groups inside them, then orders equal-key songs by tempo
and finally name. Name, tag and key compare naturally without case; BPM compares
numerically. Missing metadata stays at the end in either direction, and exact ties retain
their current set order so a partial hierarchy never invents a secondary rule.
