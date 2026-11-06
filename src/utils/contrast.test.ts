import { describe, it, expect } from 'vitest';
import { relativeLuminance, contrastRatio, cellInkOn } from './contrast';
import { THEMES } from './themes';

describe('relativeLuminance', () => {
  it('gives pure white 1 and pure black 0 (incl. shorthand hex)', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#FFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });
});

describe('contrastRatio', () => {
  it('black vs white is the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('matches the published WCAG example #767676 on white (4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5);
  });
});

describe('cellInkOn', () => {
  it('always returns ink with AA contrast (>= 4.5:1) on any theme color', () => {
    for (const theme of Object.values(THEMES)) {
      for (const fill of theme.colors) {
        const ink = cellInkOn(fill);
        expect(contrastRatio(ink.color, fill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('picks dark ink on light fills and light ink on dark fills', () => {
    expect(cellInkOn('#F0E442').color).toBe('#0b1120'); // Bright Yellow
    expect(cellInkOn('#0072B2').color).toBe('#f8fafc'); // Deep Blue
  });
});

describe('Color Safe theme (P5.4)', () => {
  const colorblind = THEMES.colorblind;

  it('exists with 8 colors and 8 names', () => {
    expect(colorblind.colors).toHaveLength(8);
    expect(colorblind.colorNames).toHaveLength(8);
  });

  it('distinctly named colors, hex formats valid', () => {
    expect(new Set(colorblind.colorNames).size).toBe(8);
    for (const c of colorblind.colors) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('adjacent palette slots differ by at least 1.6:1 luminance contrast', () => {
    // No-hue fallback: even a player who sees only luminance can order neighbors.
    for (let i = 0; i < colorblind.colors.length - 1; i++) {
      const ratio = contrastRatio(colorblind.colors[i], colorblind.colors[i + 1]);
      expect(ratio).toBeGreaterThanOrEqual(1.6);
    }
  });
});
