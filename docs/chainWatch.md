# chainWatch

Which device runs anyone is looking at, reduced to the one answer the LOM gets asked for.
`core/src/chainWatch.ts`.

## Why this isn't a boolean

Every other watch in the project is armed by one: `watchPlay` is on or off, and
`bridge.ts` refcounts it across clients in a single `Set<WebSocket>`. That works because
the cost doesn't depend on what is being watched — arming it installs the same observers
whoever asked, and however many did.

Device parameters break that on both axes at once:

- **The cost is a function of the target.** A run drawn as shells is a couple of observers
  per device. One open EQ Eight is forty more. "Is anyone watching" is not the question
  that decides what gets installed.
- **Two clients can want different targets**, and neither may release the other's. That is
  the exact bug per-kind refcounting exists to prevent, one level down: a client turning
  a watch off must not blind another. Per *kind* was enough until the watch had a target.

So the subscription is per target, and the bridge sends the **union** of what every client
declared. This file is that union.

## Declared whole, never toggled

A client sends everything it is looking at, and the previous declaration is discarded.
There is no `off`.

That isn't a stylistic choice. An `off` would have to name *which* target, so a client that
dropped a message would leak a subscription nobody can find to release — and on a watch
whose cost scales with what is held, a leak is Live getting slower with no way to explain
it. Declaring the whole view instead gives three properties for free:

- an empty array is how you stop,
- a dropped socket is exactly equivalent to sending one, so `releaseWatches` is a delete,
- no message a client can send releases a subscription another client is holding.

## Union, never intersection

Two clients on different racks both get theirs. Two on the same run with different devices
open get **both** open sets — a client that folded a device may not blind one that has it
expanded. `open` is unioned for the same reason the run list is.

A run whose `open` is empty stays in the result. It is a real subscription to that run's
shells, and dropping it would stop the one thing the shell tier exists for: noticing a
device added in Live.

## Ordered, so an unchanged union is recognisable

The result is sorted by track, then by path, then ascending within `open`, so the same set
of declarations always produces an identical value whatever order the clients arrived in.

`sameChainWatches` reads that, and the caller uses it to **skip** re-sending. That matters
more than it looks: `watch_chains` rebuilds every observer it holds each time it is told —
the same bargain `watch_play` makes — so re-sending an identical union tears down and
reinstalls the lot. A client that re-declared on every render would do that continuously.

The one place the skip is wrong is after a device reload, where the union is unchanged and
the observers behind it are gone. `rearmWatches` forces it.

## The address is a path, and it comes in pairs

A device has no id on the wire, so a run is addressed by where it sits — the same bargain
clips make with `(track, scene)`, and for the same reason. See
[`set/docs/device-chain.md`](../../set/docs/device-chain.md).

`path` is empty for a track's own device list. Otherwise it is **pairs**: a run inside a
rack is `devices M chains L`, and that chain's own `devices` is the run. `[2, 0]` is the
first chain of the rack at index 2; a rack inside that chain adds two more entries.

`validChainWatch` therefore refuses an odd length. It names half an address, resolves to
nothing, and would have the LOM side installing observers against a path Live cannot
answer — where the symptom is an error posted from a callback with nothing naming the
client that asked for it. A malformed entry rejects the **whole** declaration rather than
being filtered out of it: a subscription list silently shortened is a client drawing
controls that will never move, which looks like a bridge bug from every angle except this
one.
