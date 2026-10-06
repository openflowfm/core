# core

Read [`README.md`](README.md) as the index: docs mirror source, so `src/X.ts` is explained
in `docs/X.md`, and you can go straight there.

- **`core` imports no transport, no React, and nothing Live-specific.** It's the only code
  in open[flow] testable without Ableton running, and what keeps a different backend
  possible. The one exception is the type-only `@openflow/protocol` namespace.
- This is where the thinking goes: naming, colors, ordering, the song mapping, the scene
  move arithmetic. If a change in an app or the bridge deserves a test, the logic belongs
  here and the app calls it.
- `sceneMove.ts` **can destroy work** in a Live set — read its doc before touching it.
- Imports use the real TypeScript extension (`./derive.ts`, never `./derive.js`). Every
  consumer bundles this package from source, and one of them runs inside Max.
- Don't name things with words that already mean something in a DAW: transport, scene,
  clip, cue, bus, send, return, warp, quantize, follow action, slot, take, punch. Where a
  DAW term *is* the Live concept, use it precisely.
- A change to how something works updates its `docs/X.md` in the same commit. A doc that
  drifts is worse than none, because it's believed.

Run `npm ci`, `npm run typecheck` and `npm test`. Consumers pin this package by commit:
after pushing, update the pin in each consumer's `package.json` and lock.

Every agent commit must end with a blank line and a GitHub-compatible co-author trailer
naming the agent that actually made it, for example
`Co-authored-by: Codex <noreply@openai.com>` or
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never name an agent that didn't
write the commit.
