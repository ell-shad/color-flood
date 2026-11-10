import { describe, expect, it } from 'vitest';
import { isSoloOnlyShape, shapeForMode } from './boardShape';
import type { BoardShape, GameMode } from '../types';

const ALL_SHAPES: BoardShape[] = [
  'classic',
  'wheel',
  'cube',
  'mosaic',
  'triangle',
  'hive',
];

describe('isSoloOnlyShape', () => {
  it('marks only the cube surface as solo-only and the flat boards as shared', () => {
    expect(ALL_SHAPES.filter(isSoloOnlyShape)).toEqual(['cube']);
  });
});

describe('shapeForMode', () => {
  it('keeps every shape in solo', () => {
    for (const shape of ALL_SHAPES) expect(shapeForMode(shape, 'solo')).toBe(shape);
  });

  it('drops only the cube in multiplayer and leaves the other boards alone', () => {
    const modes: GameMode[] = ['multiplayer'];
    for (const mode of modes) {
      expect(shapeForMode('cube', mode)).toBe('classic');
      expect(shapeForMode('mosaic', mode)).toBe('mosaic');
      expect(shapeForMode('triangle', mode)).toBe('triangle');
      expect(shapeForMode('hive', mode)).toBe('hive');
      expect(shapeForMode('wheel', mode)).toBe('wheel');
      expect(shapeForMode('classic', mode)).toBe('classic');
    }
  });
});
