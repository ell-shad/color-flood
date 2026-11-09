import { describe, expect, it } from 'vitest';
import { isSoloOnlyShape, shapeForMode } from './boardShape';
import type { BoardShape, GameMode } from '../types';

const ALL_SHAPES: BoardShape[] = ['classic', 'wheel', 'cube', 'mosaic'];

describe('isSoloOnlyShape', () => {
  it('marks the cube and mosaic surfaces as solo-only and the flat boards as shared', () => {
    expect(ALL_SHAPES.filter(isSoloOnlyShape)).toEqual(['cube', 'mosaic']);
  });
});

describe('shapeForMode', () => {
  it('keeps every shape in solo', () => {
    for (const shape of ALL_SHAPES) expect(shapeForMode(shape, 'solo')).toBe(shape);
  });

  it('drops the cube in multiplayer and leaves the flat boards alone', () => {
    const modes: GameMode[] = ['multiplayer'];
    for (const mode of modes) {
      expect(shapeForMode('cube', mode)).toBe('classic');
      expect(shapeForMode('mosaic', mode)).toBe('classic');
      expect(shapeForMode('wheel', mode)).toBe('wheel');
      expect(shapeForMode('classic', mode)).toBe('classic');
    }
  });
});
