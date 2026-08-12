# `color.ts`

Live's palette spans near-white to near-black, so a label sitting
directly on a Live color needs per-swatch contrast. `inkOn()` picks dark or light ink,
and **it asks `brightness()` rather than `luminance()`** — which is the whole reason
both exist.

`luminance()` is WCAG relative luminance, which linearises the channels before
weighting them. That's the correct input to a contrast *ratio* and the wrong input to
"would a person call this light or dark": linearising drags mid-tones a long way down,
and Live's palette is mostly saturated mid-tones. Live's `#3dc300` green reads 0.40 as
luminance and 0.52 as brightness. Testing luminance against 0.45 put white ink on **44
of the 70 palette entries**, which is not what Live does and not what anyone looking at
the set would expect. `brightness()` weights the gamma-encoded channels directly, at the
classic 128/255 threshold, and leaves white on the 17 entries that are actually dark.

The palette entries that moved are pinned in `color.test.ts`. The failure mode is
"half the labels went white again", which is only visible with Live open.

`legibleOn()` is the opposite case: a scene name *is* Live's color, painted on our
near-black panel, and Live's palette contains colors invisible there. It blends toward
white only as far as the contrast ratio demands, so the hue — the entire point of
showing Live's color — survives. Pure black is the terminating case.
