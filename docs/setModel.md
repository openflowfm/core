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
rows, which means it needs a snapshot, which meant a full LOM walk on every join. The
bridge now holds both the snapshot and the model and keeps them current, so a joining
client is a payload rather than a walk of every clip slot in the set — see
[`bridge/docs/multiple-clients.md`](../../bridge/docs/multiple-clients.md).

## Who builds one

| | |
|---|---|
| `bridge.ts`, after a walk | the answer everyone else is given |
| `bridge.ts`, after a `sceneRows` delta or an `apply` carrying `sceneOps` | keeps the held one current, and relabels Push |
| `useBridge`'s `reconcile`, after a scene write | the client patched its own copy optimistically, and a header has to match the row under it |

That last one is the only place a client builds a model, and it is not a hole in the rule.
The bridge's model describes what Live has confirmed; that one describes an edit the client
has only just made and not yet heard back about. Same function, same patterns, and the next
snapshot or scene delta replaces it with an identical answer from the bridge.

Nothing in the browser reads scene names to draw a **song**. `useSongLayout` still derives
for its `derivation`, which is the *scene* layer — every scene's parsed fields, for the
scene-level modals — and that is the boundary below.

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

`SongHeader` is now built **from** a `SongEntry` — `songRows` takes the model — so the two
are one set of fields rendered once rather than twice from the same derivation.

**There is deliberately no rendered `tempo` string beside `bpm`.** The obvious symmetry —
`bpm` is what the names say, `tempo` is what Live will do, render both the same way — is
wrong under this convention, and it was briefly built. Collapsing a song's scene tempos to
`128 / 130` says two scenes disagree and stops there; but only the *first* scene carries a
tempo now, and a song whose scenes genuinely state different ones is a song that speeds
up, not a set that is wrong about itself. The two useful questions are what the song is
entered at and which scenes move it, and `firstSceneTempo` and `tempoScenes` answer both.
`clash` is bpm and key only, for the same reason: it paints the facts strip, and the strip
renders those two.

`songRows` also takes the set's scene indexes, which the model deliberately doesn't carry:
a scene belonging to no song is still a row you can select and name, and the model answers
about songs.

`songByScene` is a `Record<string, string>` rather than a `Map` because the model crosses
the wire as JSON, and a `Map` does not survive `JSON.stringify` — it arrives as `{}`,
silently, with every lookup then missing. `songAt` is the single-lookup helper; anything
doing it in a loop should build its own `Map` once.

`factsByScene` is the mapping at **scene** resolution — the role, key and bpm one scene's
own name states — keyed the same way and for the same reason. It is the rule this file is
about applied one level down: `derive()` has always read all three off the name, and
discarding them here is what left every client that wanted a scene's role writing a regex
of its own. There were three such regexes when it was added, against a convention none of
them owned.

It is what lets a reader print a fact **where it is true rather than where it was
declared**. A song whose scenes agree on the key states it once, in the header; a song that
modulates has no single key to state — `SongEntry.key` is already the collection `Bm / D`
by then — so a reader drops it from the header and prints each scene's own instead. That
question cannot be answered from `SongEntry` at all, in either direction: comparing scenes
against the song's key fails exactly when it matters, because by the time one scene differs
the value being compared against is the collection and every scene differs from it.

**Every field is absent rather than empty**, and a scene stating nothing has no entry at
all, so a set named only at the song level pays nothing for this. That is the same rule the
protocol states as "absent gets its own value, never a plausible default" — a field that
can be missing and encodes it as `''` is a bug waiting to look like data.

It stays inside the scope boundary above: all three are functions of the scene name, so a
`sceneRows` delta is enough to keep them current.

`rev` is passed in rather than read from the derivation. A derivation is a pure function
of scene rows and has no idea which snapshot revision produced them, and a model whose
`rev` disagreed with the snapshot beside it would be worse than one with no `rev` at all.
