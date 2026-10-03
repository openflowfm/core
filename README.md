# core/

**Pre-1.0: unstable and in active development; expect breaking changes.**

Pure domain logic. This is where the actual thinking goes, and the only module with
meaningful unit-test coverage.

**Docs mirror the source one-to-one: `core/src/X.ts` is explained in `core/docs/X.md`.**
So you don't need this table to find one — the path is predictable. **Read the row you
need, not the file.** Entries without a link are covered fully by their line here.

| file | | |
|---|---|---|
| [`color.ts`](docs/color.md) | palette RGB → hex, luminance, brightness, ink, legibility | |
| `livePalette.ts` | the checked-in 70-color Live table, in `color_index` order | |
| [`lomAtoms.ts`](docs/lomAtoms.md) | parsing for the atom shapes the LOM returns | ⚠ duplicated from `bridge/src/lom.ts` |
| [`pattern.ts`](docs/pattern.md) | token template evaluation + song-title parsing | |
| [`trackColumns.ts`](docs/trackColumns.md) | Live's flat track list → grid columns + group color bands | |
| [`groupSlot.ts`](docs/groupSlot.md) | what a group track's clip slot shows at one scene | |
| [`chords.ts`](docs/chords.md) | note names, key spelling and the **scale-degree colours** the chart's roll is drawn in, plus a chord reader nothing currently calls | ⚠ music is ambiguous; the reader declines |
| [`trackStatus.ts`](docs/trackStatus.md) | the playing clip → Live's track status display: loop pie, countdown, take length | ⚠ beats vs seconds |
| [`gridRange.ts`](docs/gridRange.md) | block selection + active-cell movement over the columns | |
| [`ops.ts`](docs/ops.md) | building clip writes, reversing them, and applying them | the undo story |
| [`roles.ts`](docs/roles.md) | scene roles: the `[role]` tag, and scene writes | |
| `songTags.ts` | open song-tag syntax + editor suggestions | |
| [`sceneTitle.ts`](docs/sceneTitle.md) | the rest of the scene name — `@{key} {SONG} - {ARTIST} {TAG}` | |
| [`defaultArtist.ts`](docs/defaultArtist.md) | safely fill blank artist facts across a set | |
| [`namePattern.ts`](docs/namePattern.md) | patterns that can be read back: format, parse, validate | the keystone of the scheme |
| [`derive.ts`](docs/derive.md) | the set → the mapping, by reversing the pattern | |
| [`setModel.ts`](docs/setModel.md) | the mapping → the shape everything consumes, derived once | the bridge holds it |
| [`songRows.ts`](docs/songRows.md) | songs → grid rows + song headers, and what folding hides | |
| [`chainWatch.ts`](docs/chainWatch.md) | which device runs anyone is watching, unioned across clients | |
| [`sceneMove.ts`](docs/sceneMove.md) | reordering scenes: the index arithmetic, so it's testable | ⚠ **can destroy work** |
| [`clipMove.ts`](docs/clipMove.md) | dragging clips: the copy order, so nothing is clobbered | |
| [`snapshotDelta.ts`](docs/snapshotDelta.md) | merging a partial re-read back in — clips by scope, rows by index | |
| `backstop.ts` | when the **bridge** should re-walk the set on its own initiative | ⚠ no doc; `shouldWalk` is cited from `bridge/docs/multiple-clients.md` |
| [`songOrder.ts`](docs/songOrder.md) | a running order of songs → the order the scenes go in | |
| [`colorRules.ts`](docs/colorRules.md) | a color per song, from a rule over the whole set | |
| `index.ts` | barrel | |

Run with `npm test` from the repo root. 588 tests.

## Install

```sh
npm install @openflow/core
```

The package ships compiled JavaScript and `.d.ts` in `dist/`, built from `src/`.
Import a module by its source file name, or everything from the package root:

```ts
import { derive } from '@openflow/core/derive.ts';
import { hex, buildSetModel } from '@openflow/core';
```

`@openflow/core/<file>.ts` resolves through the exports map to `dist/<file>.js` and
`dist/<file>.d.ts`, so the specifier keeps its `.ts` but nothing has to strip types
from `node_modules`. Every module in the table above is a subpath.

Signatures use the `@openflow/protocol` global `OpenFlow` namespace. Each declaration
file that does references `@openflow/protocol/global.d.ts` itself, so importing a
single module brings the namespace with it.

## Releasing

Releases are automated with [Changesets](https://changesets.dev) and
`.github/workflows/release.yml`.

### Versioning

The package is below 1.0 and unstable:

- **Breaking change: minor bump** (`0.1.x` → `0.2.0`).
- **Feature or fix: patch bump** (`0.1.0` → `0.1.1`).
- **No prereleases during 0.x.** Every release is a plain `0.y.z` on `latest`.
- **1.0.0 is the first release for other people**, the point where the API is
  meant to hold and breaking changes start taking a major bump.

Consumers depend on a caret range (`^0.1.0`), which below 1.0 accepts patches but
not the next minor, so a breaking release never reaches them without an update PR.

### How a release happens

1. In any PR that changes what consumers get, run `npx changeset`, pick the bump
   by the policy above and describe the change. Commit the generated file in
   `.changeset/`.
2. When that PR merges, the Release workflow opens (or updates) a **Version
   packages** PR that bumps `package.json` and writes `CHANGELOG.md`.
3. Merging the Version packages PR publishes to npm with provenance, using npm
   trusted publishing (OIDC, no `NPM_TOKEN`), tags the release on GitHub, then
   sends a `repository_dispatch` (`event_type: renovate`) to
   `openflowfm/renovate` so consumers get their update PRs straight away.

PRs opened by the workflow's `GITHUB_TOKEN` don't trigger CI; the Version
packages PR only touches the version and changelog, and the Release workflow
re-runs typecheck, build and tests before publishing.

### One-time setup (owner, by hand)

Do these in order, before merging the first Version packages PR:

1. **npm org.** The `@openflow` scope is the `openflow` organisation on
   npmjs.com, shared with `@openflow/protocol`. Create it if it doesn't exist.
2. **First publish by hand.** Trusted publishers can only be configured on a
   package that already exists. `@openflow/protocol@0.1.0` must already be on npm.
   From a clean checkout of `main`:
   `npm ci && npm login && npm publish --access public --tag next --provenance=false`
   This publishes the current pre-release (`0.1.0-rc.4`) under the `next` tag, so
   it never becomes `latest`. (`--provenance=false` because provenance needs CI.)
3. **Trusted publisher.** On npmjs.com, package `@openflow/core` > Settings >
   Trusted publishing > GitHub Actions: organisation `openflowfm`, repository
   `core`, workflow `release.yml`, no environment. Optionally then set
   "Publishing access" to require 2FA and disallow tokens.
4. **Actions permissions.** In the repo's Settings > Actions > General, enable
   "Allow GitHub Actions to create and approve pull requests" (the Version
   packages PR needs it).
5. **Renovate dispatch secret.** Add a repository secret
   `RENOVATE_DISPATCH_TOKEN`: a fine-grained token with Contents read/write on
   `openflowfm/renovate` (what `repository_dispatch` requires). Without it the
   notify step is skipped and Renovate picks the release up on its schedule.

Then merge the Version packages PR: the workflow publishes `0.1.0` as `latest`.

## The one rule

**`core/` imports no transport, no React, and nothing Live-specific.**

No `ws`, no `max-api`, no `LiveAPI`, no DOM, no `fetch`, no `fs`. It may import types
from `protocol/`, nothing more.

Two reasons this matters:

1. **It's testable without Live running.** Everything else in this project needs
   Ableton open and a device loaded. `core/` runs in vitest in milliseconds, which is
   the only way the domain logic gets real coverage.
2. **It keeps the backend replaceable.** The long-term plan has Live as one possible
   backend, not the only one. Anything Live-specific that leaks in here has to be
   untangled later.

If a function needs to know *how* data arrives, it belongs in `bridge/` or `set/lib/`.

## What belongs here next

Roughly the order it's coming:

- **Song segmentation** — grouping a flat scene list into songs. Needs a real answer
  for what marks a boundary in the actual set. Roles already give a scene a label; a
  song is the run of scenes that shares one.
- **Shape fingerprinting and template matching** — a song's scene×track occupancy
  matrix, clustered so one gesture assigns roles to a whole song positionally.
- **Scheme evaluation** — role→color map plus naming template, applied over a snapshot
  to produce a desired state.
- **Diff generation** — desired vs actual, as `(clip, field, before, after)` batches.
  Must record `before` values: that's what makes undo possible, since the LOM gives us
  none.
- **Lint** — anything that doesn't conform to the scheme, surfaced as a count.

All of these are pure functions over a `Snapshot`. That's the point.
