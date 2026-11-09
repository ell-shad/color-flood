import { describe, expect, it } from 'vitest';
import { isSoloOnlyShape, shapeForMode } from './boardShape';
import type { BoardShape, GameMode } from '../types';

const ALL_SHAPES: BoardShape[] = ['classic', 'wheel', 'cube'];

describe('isSoloOnlyShape', () => {
  it('marks the cube surface as solo-only and the flat boards as shared', () => {
    expect(ALL_SHAPES.filter(isSoloOnlyShape)).toEqual(['cube']);
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
      expect(shapeForMode('wheel', mode)).toBe('wheel');
      expect(shapeForMode('classic', mode)).toBe('classic');
    }
  });
});
