# `namePattern.ts`

The keystone of the declarative scheme (issue #1), and the
generalisation `sceneTitle.ts` is a hand-written special case of. A pattern compiles
into a formatter, a parser, and a verdict on whether it was safe to compile at all.

**The parser is the point.** Writing names is easy; the scheme rests on being able to
look at `[CHORUS] @128-Bm NIGHTFALL {COVER}` six months later and recover which song, tag
and role it belongs to with nothing stored on the side. That's what lets the mapping live
in the set, need no ids, and travel with the `.als`.

Two kinds of ambiguity, and **only one is fatal**:

| | | |
|---|---|---|
| **Undecidable** | `{song} {label}` | Two free fields, whitespace between. "Glass Tunnel Arp" splits three ways and nothing says which. Rejected. |
| **Resolvable** | `{song} {bpm?}` | "Nightfall 128" is a song called that, *or* a song at 128. Both real, one obviously meant. Allowed, under a stated rule. |
| **Resolvable** | `{song} ( - {artist})?` | The shipped convention. "Sunday - Bloody Sunday" is a song called that, *or* a song by that artist. The separator says which reading fills more parts. |

The rule for the second is **a name is read as filling as many parts as it can**,
implemented by matching the free token lazily. That's why `{song} {label}` is rejected
where `{song} {bpm?}` isn't, and it's the distinction to keep hold of — "ambiguous"
alone would have rejected both.

Note the separator, not the count, is what makes two free tokens fatal:
`{song} - {label}` is fine, because `" - "` says where the split is.

**The probe is the validator, and that's deliberate.** Structural checks catch the
undecidable cases and give them messages you can act on. Everything else is settled by
*measuring*: format sample values through the pattern, parse them back, require they
survive. So this file needs no complete theory of when a pattern is reversible — only an
honest test — and a pattern shape nobody anticipated fails loudly at definition time
rather than quietly at apply time.

Two things follow, both load-bearing:

- **Every token carries two samples**, and the second one earns its place. `{song}
  {role}` round-trips perfectly for `Nightfall`/`chorus` and breaks for `Glass Tunnel`/
  `post chorus` — one sample would have waved it through. That test is also the formal
  justification for `[{role}]` having brackets at all.
- **The probe judges reversibility, not taste.** `{song} [{role?}] {bpm}` writes
  `Nightfall] 128` when the role is absent, which is ugly and *does* round-trip, so it's
  allowed. A pattern its author regrets is their problem; one the app can't read back is
  ours.

## Optional groups

`( … )?` marks a run that appears together or not at all, carrying its own delimiters
with it. It exists because the rule an optional *token* follows — take the literal before
you, and the one after you only at the very end of the pattern — **cannot express a
bracketed field in the middle of a name**. `[{role?}] {song}` formats a role-less scene
as `] NIGHTFALL`: the opening bracket leaves with the token and the closing one is
stranded. Every convention that puts the title last needs this.

Inside a group, a literal with a token on **both** sides is a *separator* and survives
only while both sides do; a literal at the group's edge stands as long as the group does.
That one rule is what makes `@128-Bm`, `@128` and `@Bm` fall out of a single pattern
rather than three.

**A free token may sit in a group, but only behind a literal.** `( - {artist})?` is legal
and `({artist})?` is not, which is the two-free-tokens rule again rather than a second one:
what makes free text readable back is a separator, and a bracket that contains no separator
adds nothing. Sitting inside the group is what lets the `" - "` leave with the artist
instead of stranding it on a song that has none.

Groups don't nest. One level covers everything the scheme needs, and a nested version
would need a story for what a half-present inner group means that nobody has a use for.

Two smaller decisions worth not re-litigating:

- **`(` only opens a group when there's a matching `)?`.** Otherwise it's a literal,
  which is what lets `{song} (live)` work without this file inventing an escape syntax.
- **A space next to a group compiles to `\s*`, and only next to a group.** The group can
  vanish, and then there's nothing for the space to sit between. Relaxing *every* space
  breaks a pattern whose tokens are all required — `{song} {role}` with a lazy `{song}`
  reads "Nightfall chorus" as song `N` and role `ightfall chorus` the moment the space
  between them stops being mandatory. There's a test holding that down.

## Reading more than one convention

`derive` takes a list of patterns and reads each name with **whichever gets the most out
of it** — not the first that matches. That's forced rather than chosen: every scene
pattern is *total*, because `{song}` is free and everything else optional, so any pattern
matches any name by swallowing it whole. First-match-wins would consult only the first
entry, and the current convention would read `Nightfall 128 Bm [verse]` as one long song
name.

Counting fields is the same rule the pattern language already applies *within* a pattern
— a name is read as filling as many parts as it can — lifted one level. Ties go to the
earlier pattern, so the current convention wins a genuine ambiguity.

That rule is also what keeps the list short. **A pattern that is another pattern minus
some optional groups can never be chosen**, because the longer one matches everything it
matches and reads at least as many fields out. `([{role}])? (@{bpm?}-{key?})? {song}` was
in the list until the current convention grew its own `{bpm}` slot back and made it
exactly that — so it was deleted rather than kept as a comment pretending to be code. The
two entries that remain are reachable because they *order* their fields differently: the
leading-tag form puts `{tag}` before the facts, and the legacy form puts the facts and the
role after the song.

This is what makes a convention change survivable at all. The mapping lives in the names,
so switching patterns outright would make every scene in an already-named set unmapped at
once: the songs would vanish from the grid and there would be nothing left to select in
order to rename them. Instead a set converts scene by scene, and a half-converted song
still collects into one entry because song identity folds case.

`parse` returns `null` rather than a partial result. During the mapping pass `null` is
the common and correct answer — this scene isn't named by the scheme yet — while a
half-read name would attach a scene to the wrong song.
