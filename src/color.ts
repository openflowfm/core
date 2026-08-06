// Color is always an index into Live's palette. RGB only ever exists for
// rendering, never as something we write.

/** `0xRRGGBB` -> `#rrggbb`. */
export function hex(rgb: number): string {
  return '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * Relative luminance (WCAG), 0..1. Clip labels sit directly on the clip color,
 * so label contrast has to be chosen per swatch.
 */
export function luminance(rgb: number): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = channel((rgb >> 16) & 0xff);
  const g = channel((rgb >> 8) & 0xff);
  const b = channel(rgb & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Perceived brightness, 0..1 — the classic luma weights on the channels **as
 * they are**, with no gamma linearisation.
 *
 * Deliberately not `luminance` above, and the difference is the whole reason
 * this exists. WCAG relative luminance linearises first, which drags mid-tones
 * a long way down: Live's `#3dc300` green reads 0.40 there and 0.52 here. The
 * WCAG figure is the right one for a *contrast ratio*, and the wrong one for
 * "would a person call this color light or dark" — which is the question
 * `inkOn` is actually asking.
 */
export function brightness(rgb: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Ink color for text laid over `rgb` — black on light, white on dark.
 *
 * Threshold at the classic 128/255, which is what Live itself lands on: across
 * the 70-color palette this puts white on the 17 genuinely dark entries (the
 * navies, the dark grey, the browns) and black on everything else, matching
 * what Live draws in its own track headers and clip slots.
 *
 * It used to test WCAG luminance against 0.45 and put white on **44 of 70** —
 * more than half the palette, including colors nobody would call dark. Live's
 * palette is mostly light and saturated, which is exactly the region where the
 * two measures disagree; see `brightness`.
 */
export function inkOn(rgb: number): string {
  return brightness(rgb) > 128 / 255 ? '#141417' : '#f2f2f4';
}

/** WCAG contrast ratio between two colors, 1..21. */
export function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The nearest lighter version of `rgb` that stays legible on `bg`.
 *
 * Clip labels sit *on* their color, so `inkOn` can just pick black or white.
 * A scene name is the opposite case: the Live color becomes the text, on our
 * near-black panel, and Live's palette contains colors dark enough to be
 * invisible there. Blending toward white preserves the hue — which is the
 * whole point of showing Live's color — while buying back contrast.
 *
 * Returns `rgb` unchanged when it already clears `minRatio`.
 */
export function legibleOn(rgb: number, bg: number, minRatio = 4.5): number {
  if (contrast(rgb, bg) >= minRatio) return rgb;

  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = rgb & 0xff;

  // 20 steps of 5% toward white reaches white exactly, so this terminates even
  // for a color that can never clear the ratio (nothing can, against white).
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const mix =
      ((Math.round(r + (255 - r) * t) << 16) |
        (Math.round(g + (255 - g) * t) << 8) |
        Math.round(b + (255 - b) * t)) >>>
      0;
    if (contrast(mix, bg) >= minRatio) return mix;
  }
  return 0xffffff;
}
