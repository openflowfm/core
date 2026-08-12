# `colorRules.ts`

A color per song for the whole set at once. `useSongColor` paints
what you selected with the swatch you pressed; this decides what every band should be:
songs sharing a key sharing a color, or the palette walking with the tempo. Neither can be
produced a swatch at a time, which is the reason it exists.

Three decisions carry it:

- **A rule never invents the fact it keys on.** A song whose scenes don't state a key isn't
  "the no-key color" — it's left alone, and named in `skipped` so the caller can say so.
  Coloring a song by a fact nobody wrote down is how a color stops meaning anything. A
  song whose scenes *disagree* is the same case: the caller passes it as unstated, the way
  the header renders the clash instead of picking one.
- **Grouping rules wrap on the number of groups, not the number of songs**, or two songs
  sharing a key would drift apart. bpm orders ascending, so the palette walks with the
  tempo; key orders by first appearance, since keys have no order anyone agrees on and
  first appearance is what derivation already uses.
- **`random` takes a seed and deals from a shuffled bag.** The seed keeps `core` pure and
  makes the preview and the write the same roll — re-rolling is a different number, not a
  different function. The bag means every allowed color is used before any repeats, and the
  one swap at each refill means no two songs in a row match. Independent draws clump, and
  a clump of one color across three adjacent songs is exactly what a band is for.
