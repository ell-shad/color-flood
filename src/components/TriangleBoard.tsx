import React, { useMemo } from 'react';
import type { GameTheme } from '../types';
import {
  triangleDistanceField,
  triangleLayout,
  triangleSeedCell,
} from '../utils/triangleEngine';
import { TilingBoard } from './TilingBoard';

interface TriangleBoardProps {
  grid: number[][];
  size: number;
  theme?: GameTheme;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
}

export const TriangleBoard: React.FC<TriangleBoardProps> = ({
  grid,
  size,
  theme,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const rows = grid.length || Math.max(1, Math.floor(size / 2));
  const cols = grid[0]?.length ?? size * 2;
  const layout = useMemo(() => triangleLayout(rows, cols), [rows, cols]);
  const distances = useMemo(() => triangleDistanceField(rows, cols), [rows, cols]);
  const seedCell = triangleSeedCell(rows, cols);
  const seed = seedCell[0] * cols + seedCell[1];

  return (
    <TilingBoard
      grid={grid}
      cells={layout.cells}
      seed={seed}
      distances={distances}
      label={`Triangle board, ${layout.cells.length} triangular cells`}
      theme={theme}
      showColorSymbols={showColorSymbols}
      frameWidth={frameWidth}
      boardPx={boardPx}
    />
  );
};
