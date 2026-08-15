# `roles.ts`

What a scene is *for*: `intro`, `verse`, `chorus`, `jam`. One role per
scene, stored as a bracketed tag in the scene's own name:

```
[CHORUS] @Bm NIGHTFALL
```

**The set is the storage, and that's the design.** Scenes have no stable id in the LOM,
so a sidecar file could only be keyed by index — which silently relabels everything below
an inserted scene — or by name, at which point the name is already the identity and the
file buys nothing. In the name, the role travels with the `.als` to the gig laptop and is
visible in Live itself.

**The tag is bracketed rather than a bare word**, and this is the part worth defending.
A bare word could only be recognised by matching against the vocabulary — so renaming a
role from `jam` to `solo` would make every scene using it silently roleless. A tag stays visibly *there* when its name is unknown, which is the
difference between a failure you can see and one that just loses data. `ROLE_CHARS` is
deliberately narrow for the same reason: a scene may carry brackets of its own
(`[alt mix/b]`), and only things shaped like role names are read as roles.

`roleKey` matches case-insensitively, so `[Chorus]` typed by hand in Live and `[chorus]`
written by us are one role rather than two entries with two colors. `mergeVocabulary`
unions the configured list with whatever is actually tagged in the set — a vocabulary
listing only what someone remembered to configure would hide a role typed straight into
Live and then fail to color it for no visible reason.

The scene-write half mirrors `ops.ts`, with one exclusion that's specific to scenes:
**a scene that had no color at all cannot be restored to having none.** Live documents
`Scene.color_index` as nullable and Max's LiveAPI can't construct that None to write it,
so `inverseSceneOps` drops the color revert rather than painting slot 0 over it — an undo
that leaves the scene a color it never had is worse than one that leaves it alone.
`countUnrevertableColors` exists so the caller can *say* so; an undo that quietly does
less than it claims is exactly what this module is written to avoid.

**The tempo writes are the only ones in here that change how the set sounds.** Everything
else renames or recolors; a scene with its own tempo enabled changes the *song* tempo the
moment it fires, so this stays a deliberate action rather than a side effect of renaming.
Below `MIN_TEMPO` means "clear it", which is also the way back out after turning it on.

**`songTempoOps` is the one to reach for, and `tempoOps` is its primitive.** A song's bpm
is projected onto its **first** scene and cleared off every other scene the song has one
on. First scene only is the whole point: the tempo used to sit on every scene, and Live
takes a scene's tempo the moment it fires, so a 128 song could only ever be *entered* at
128 — dropping into its second chorus while the set ran at 124 snapped everything. One
scene carries it, the rest follow whatever is already playing.

The clearing half is the **migration**, not a tidy-up: it reads `tempoScenes` from the
derivation, so a set written the every-scene way converts song by song through the same
call that projects a new one. The write is ordered before the clears, because a run that
fails partway should leave the song enterable at its own tempo rather than at none.

`tempoOps` stays for the "these exact scenes" case, which is what `songTempoOps` is built
out of.

Unlike color, **tempo reverses cleanly in both directions**: "follows the song" is a state
Live will accept a write for, where "no color" is not. So turning a tempo on is fully
undoable and there's no counterpart to `countUnrevertableColors`.
