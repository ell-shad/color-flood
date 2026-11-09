/**
 * P5.4: WCAG 2.1 contrast math for the color-blind aids.
 *
 * The board draws colors chosen by the player; an overlay symbol on a cell
 * needs text that stays ≥ 4.5:1 against whichever theme color sits under
 * it, and the helpers below keep that decision out of the render path.
 */

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Expands #RGB shorthand and drops the leading '#'. */
const parseHex = (hex: string): string => {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return '888888';
  if (m[1].length === 3) {
    return m[1]
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  return m[1];
};

const srgbChannelToLinear = (c8: number): number => {
  const v = c8 / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** Relative luminance of a #RRGGBB (or #RGB) color per WCAG 2.1. */
export const relativeLuminance = (hex: string): number => {
  const s = parseHex(hex);
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
};

/**
 * `rgba()` for a theme hex at the given alpha. Used by the emoji skin: cells
 * keep a shade of their colour (so hue and flood connectivity stay readable)
 * without the full saturated fill that would fight the glyph.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const s = parseHex(hex);
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** WCAG contrast ratio (1..21) between two hex colors. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

const SOFT_DARK_INK = '#0b1120';
const SOFT_LIGHT_INK = '#f8fafc';

export interface CellInk {
  color: string;
  /** Matching text-shadow keeps the glyph readable on mid-luminance cells. */
  shadow: string;
}

const lightInkShadow = '0 1px 2px rgba(2,6,23,0.55)';
const darkInkShadow = '0 1px 1px rgba(255,255,255,0.45)';

/**
 * Picks the first ink with ≥ 4.5:1 (AA) on `bg`, preferring the softer
 * near-black/near-white inks and falling back to pure black/white when a
 * mid-tone fill leaves neither soft ink compliant — one of the two pure
 * inks always has ≥ 4.5:1 (they enclose the whole luminance range).
 */
export const cellInkOn = (bg: string): CellInk => {
  const bgL = relativeLuminance(bg);
  const ratioOn = (ink: string) => contrastRatio(ink, bg);
  for (const ink of [SOFT_DARK_INK, SOFT_LIGHT_INK, '#000000', '#ffffff']) {
    if (ratioOn(ink) >= 4.5) {
      const relativeLum = relativeLuminance(ink);
      return relativeLum > bgL
        ? { color: ink, shadow: darkInkShadow }
        : { color: ink, shadow: lightInkShadow };
    }
  }
  // Unreachable (black/white strictly bracket AA on every bg+0.05 > 0), but
  // keep a safe default for malformed input.
  return { color: '#ffffff', shadow: darkInkShadow };
};
