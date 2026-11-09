import React, { useMemo } from 'react';
import type { GameTheme } from '../types';
import { hiveDistanceField, hiveLayout, hiveSeedCell } from '../utils/hiveEngine';
import { TilingBoard } from './TilingBoard';

interface HiveBoardProps {
  grid: number[][];
  size: number;
  theme?: GameTheme;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
}

export const HiveBoard: React.FC<HiveBoardProps> = ({
  grid,
  size,
  theme,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const rows = grid.length || size;
  const cols = grid[0]?.length ?? size;
  const layout = useMemo(() => hiveLayout(rows, cols), [rows, cols]);
  const distances = useMemo(() => hiveDistanceField(rows, cols), [rows, cols]);
  const seedCell = hiveSeedCell(rows, cols);
  const seed = seedCell[0] * cols + seedCell[1];

  return (
    <TilingBoard
      grid={grid}
      cells={layout.cells}
      seed={seed}
      distances={distances}
      label={`Hexagon hive board, ${layout.cells.length} hexagonal cells`}
      theme={theme}
      showColorSymbols={showColorSymbols}
      frameWidth={frameWidth}
      boardPx={boardPx}
    />
  );
};
