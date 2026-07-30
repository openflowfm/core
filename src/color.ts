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

/** Ink color for text laid over `rgb`. Live's palette spans both extremes. */
export function inkOn(rgb: number): string {
  return luminance(rgb) > 0.45 ? '#141417' : '#f2f2f4';
}
