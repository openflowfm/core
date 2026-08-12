# `pattern.ts`

The naming half of the scheme. A pattern like
`{bpm} {key} {label} {role}` renders to `128 Bm Arp Jam 1`. Unresolved tokens are
dropped and whitespace collapsed, so a missing `{key}` can never write a literal
`{key}` into a clip name and never leaves a double space.

This is the piece that has to be provably right before it renames thousands of clips.

It used to also carry `parseSongTitle`, reading `{bpm} {key} {label}`. The scene name
convention settled the other way round, so that was removed rather than left as a
second contradictory answer to "how do you read a title" — see `sceneTitle.ts`, which
is the one with callers. `{label}` remains a token you can supply a value for; nothing
parses it back out of a name.
