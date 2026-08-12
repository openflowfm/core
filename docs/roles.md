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

**`tempoOps` is the one write in here that changes how the set sounds.** Everything else
renames or recolors; a scene with its own tempo enabled changes the *song* tempo the
moment it fires. BPM therefore lives on `Scene.tempo`, separately from the scene name;
folding it into a rename would make a naming pass quietly alter playback. Below
`MIN_TEMPO` means "clear it", which is also the way back out after turning it on.

Unlike color, **tempo reverses cleanly in both directions**: "follows the song" is a state
Live will accept a write for, where "no color" is not. So turning a tempo on is fully
undoable and there's no counterpart to `countUnrevertableColors`.
