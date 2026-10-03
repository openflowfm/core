---
"@openflow/core": patch
---

First release on npm as `@openflow/core`. The package now ships compiled
JavaScript and `.d.ts` (`dist/`) instead of TypeScript source. Every existing
import keeps working: `@openflow/core/<file>.ts` resolves to the compiled
`dist/<file>.js` and its declarations, and the package root `@openflow/core` is
the barrel. `@openflow/protocol` is now a semver range (`^0.1.0`), and each
declaration that uses the `OpenFlow` namespace references the protocol's
`global.d.ts` itself.
