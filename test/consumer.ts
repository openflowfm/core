// Type-level consumer check: resolves the package through its own exports map
// (self-reference), exactly as an installed consumer would, against the built
// dist/. Compiled by `npm run test:package` with the resolution consumers use
// (Bundler, `.ts` specifiers) and skipLibCheck off, so a broken `types`
// condition, a missing subpath or a dangling `OpenFlow` reference fails here.
//
// @openflow/protocol's global.d.ts is deliberately NOT listed in tsconfig: it
// must arrive through the references preserved in dist/*.d.ts.

import * as root from '@openflow/core';
import { derive } from '@openflow/core/derive.ts';
import { buildSetModel } from '@openflow/core/setModel.ts';
import { hex } from '@openflow/core/color.ts';

// Every subpath consumers import today (bridge, chart, mix, set) resolves.
import '@openflow/core/backstop.ts';
import '@openflow/core/chainWatch.ts';
import '@openflow/core/chords.ts';
import '@openflow/core/clipMove.ts';
import '@openflow/core/colorRules.ts';
import '@openflow/core/defaultArtist.ts';
import '@openflow/core/gridRange.ts';
import '@openflow/core/groupSlot.ts';
import '@openflow/core/index.ts';
import '@openflow/core/livePalette.ts';
import '@openflow/core/lomAtoms.ts';
import '@openflow/core/namePattern.ts';
import '@openflow/core/newSong.ts';
import '@openflow/core/ops.ts';
import '@openflow/core/pattern.ts';
import '@openflow/core/roles.ts';
import '@openflow/core/sceneMove.ts';
import '@openflow/core/sceneTitle.ts';
import '@openflow/core/snapshotDelta.ts';
import '@openflow/core/songOrder.ts';
import '@openflow/core/songRows.ts';
import '@openflow/core/songTags.ts';
import '@openflow/core/trackColumns.ts';
import '@openflow/core/trackStatus.ts';

// The root barrel and the deep paths are the same declarations.
const sameDerive: typeof derive = root.derive;
const sameHex: typeof hex = root.hex;

// The protocol's global namespace is in scope and is what core's signatures use.
const model: OpenFlow.SetModel = buildSetModel({} as Parameters<typeof buildSetModel>[0], 0);

export { sameDerive, sameHex, model };
