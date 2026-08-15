# `setModel.ts`

The set as this app understands it, packaged once. `derive()` reads the mapping back out
of the scene names; this turns that reading into the shape everything else consumes, with
the facts already rendered — so **nothing downstream parses a name again**. Ask for the
songs in the set and you get them, without compiling a pattern or knowing that names are
where the mapping lives.

## Why it exists

That parse was happening twice. The bridge ran `derive()` to build Push's song list, and
every browser tab ran the same `derive()` over the same scene names to draw the grid. Two
answers to one question, computed from one input by one function — which is exactly the
drift this project's naming scheme is built to avoid, arrived at from the other direction.
The bridge owns the answer now and ships it; a client holds a `SetModel` and never calls
`derive()` at all.

The second reason is the walk. A client that has to derive the mapping needs the scene
rows, which means it needs a snapshot, which meant a full LOM walk on every join. Once the
bridge holds both the snapshot and the model, a joining client is a payload rather than a
walk of every clip slot in the set.

## The scope boundary is load-bearing

Everything in a `SetModel` is a function of **scene names and `Scene.tempo`** — which is
exactly what a `sceneRows` delta carries, so the bridge can keep it current from the
signal it already receives. Fold in anything that reads the clips and that stops being
true: `blockTrackRoles`, which answers what a folded song holds per track, is a function
of the clips as well, so it stays in the browser. Moving it here would make every clip
edit anywhere in the set rebuild the entire song list.

That's the test for anything proposed for this file. If a scene rename can't change it,
it doesn't belong here.

## Shapes

`SongEntry`'s facts are **rendered strings**, not the observed arrays — `128`, or
`128 / 130` when the song's scenes state two. Same constraint `SongHeader` obeys and for
the same reason: they cross into a memoized React row, and an array prop re-renders every
header in the set on each change. The `…Clash` booleans are what a renderer branches on
instead of inspecting the string.

`songByScene` is a `Record<string, string>` rather than a `Map` because the model crosses
the wire as JSON, and a `Map` does not survive `JSON.stringify` — it arrives as `{}`,
silently, with every lookup then missing. `songAt` is the single-lookup helper; anything
doing it in a loop should build its own `Map` once.

`rev` is passed in rather than read from the derivation. A derivation is a pure function
of scene rows and has no idea which snapshot revision produced them, and a model whose
`rev` disagreed with the snapshot beside it would be worse than one with no `rev` at all.
