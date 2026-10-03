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
- Imports use the real TypeScript extension (`./derive.ts`, never `./derive.js`). The
  build (`tsconfig.build.json`, `rewriteRelativeImportExtensions`) rewrites them to
  `.js` in `dist/`, and consumers import `@openflow/core/<file>.ts`, which the exports
  map sends to `dist/`. One consumer (bridge) bundles it for Node for Max.
- A source file that uses the `OpenFlow.*` namespace starts with
  `/// <reference types="@openflow/protocol/global.d.ts" preserve="true" />`, so its
  published `.d.ts` brings the namespace with it. `npm run test:package` fails
  without it.
- Don't name things with words that already mean something in a DAW: transport, scene,
  clip, cue, bus, send, return, warp, quantize, follow action, slot, take, punch. Where a
  DAW term *is* the Live concept, use it precisely.
- A change to how something works updates its `docs/X.md` in the same commit. A doc that
  drifts is worse than none, because it's believed.

## Checks

Run `npm ci` once per worktree. Each check is quick; run each once, in this order,
after your last edit. CI (`.github/workflows/ci.yml`) runs the same list on every push
and PR. There is no watcher.

| Command | What it checks | When to run |
| --- | --- | --- |
| `npm run typecheck` | `src/` compiles, tests included (no emit) | Any `.ts` change |
| `npm test` | The unit tests (`src/**/*.test.ts`, vitest). CI runs `npm run test:coverage`, the same tests with coverage | Any `src/` change |
| `npm run build` | Emits `dist/*.js` and `dist/*.d.ts` from `src/` (tests excluded) | Before `npm run test:package` or `npm pack`; after changing exports, `tsconfig.build.json` or adding a module |
| `npm run test:package` | Type-level and runtime consumer checks against `dist/` through the exports map (`test/`) | Any change to `package.json` exports, the build, or which modules use `OpenFlow.*`; needs `npm run build` first |
| `npm pack --dry-run` | The tarball holds only `dist/`, `docs/`, README, LICENSE, `package.json` | Any change to `files`, `exports` or the build |

## Releasing

Published to npm as `@openflow/core`; consumers depend on a semver range and
Renovate opens their update PRs. See README > Releasing.

- **Versioning below 1.0:** a breaking change takes a **minor** bump, a feature or a
  fix a **patch** bump. No prereleases during 0.x. 1.0.0 is the first release for
  other people.
- Changing what consumers get (behaviour, types, exports, files) needs a changeset:
  `npx changeset`, pick the bump by the rule above, commit the file under
  `.changeset/`.
- Never run `npm publish` or bump `version` by hand. The Release workflow does both.
- `RENOVATE_DISPATCH_TOKEN` and the `renovate` dispatch event type are a shared
  contract with `openflowfm/renovate`; don't rename them.
- `dist/` is build output and gitignored.

## Commits

Every agent commit must end with a blank line and:

Co-authored-by: Codex <noreply@openai.com>
