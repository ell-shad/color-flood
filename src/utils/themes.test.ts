import { describe, it, expect } from 'vitest';
import type { ThemeId } from '../types';
import { THEMES } from './themes';

describe('themes', () => {
  it('keys match ids and every theme has eight colors and eight names', () => {
    for (const id of Object.keys(THEMES) as ThemeId[]) {
      const theme = THEMES[id];
      expect(theme.id).toBe(id);
      expect(theme.colors).toHaveLength(8);
      expect(theme.colorNames).toHaveLength(8);
      expect(new Set(theme.colorNames).size).toBe(8);
    }
  });

  it('emoji theme maps every color slot to its own glyph', () => {
    const theme = THEMES.emoji;
    expect(theme.emoji).toHaveLength(8);
    expect(new Set(theme.emoji).size).toBe(8);
    for (const glyph of theme.emoji ?? []) expect(glyph.trim().length).toBeGreaterThan(0);
    // One glyph per fill: a cell's emoji always identifies its color.
    expect(theme.emoji).toHaveLength(theme.colors.length);
  });
});
