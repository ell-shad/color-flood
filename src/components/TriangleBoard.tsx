import React, { useMemo } from 'react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
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
  mode?: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
  lastMovingPlayer?: 1 | 2;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
}

export const TriangleBoard: React.FC<TriangleBoardProps> = ({
  grid,
  size,
  theme,
  mode = 'solo',
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  lastMovingPlayer = 1,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const rows = grid.length || Math.max(1, Math.floor(size / 2));
  const cols = grid[0]?.length ?? size * 2;
  const layout = useMemo(() => triangleLayout(rows, cols), [rows, cols]);
  const seedCell = triangleSeedCell(rows, cols);
  const distances = useMemo(() => {
    if (mode !== 'multiplayer') return triangleDistanceField(rows, cols);
    const activeKey = lastMovingPlayer === 2 ? p2Cells[0] : p1Cells[0];
    const [r, c] = (activeKey ?? `${seedCell[0]},${seedCell[1]}`).split(',').map(Number);
    const start = r * cols + c;
    const distances = new Int16Array(layout.cells.length).fill(-1);
    if (start < 0 || start >= layout.cells.length)
      return triangleDistanceField(rows, cols);
    distances[start] = 0;
    const queue: number[] = [start];
    let head = 0;
    while (head < queue.length) {
      const index = queue[head++];
      for (const next of layout.cells[index].neighbours) {
        if (distances[next] === -1) {
          distances[next] = distances[index] + 1;
          queue.push(next);
        }
      }
    }
    return distances;
  }, [cols, lastMovingPlayer, layout, mode, p1Cells, p2Cells, rows, seedCell]);
  const seed = seedCell[0] * cols + seedCell[1];

  return (
    <TilingBoard
      grid={grid}
      cells={layout.cells}
      seed={seed}
      distances={distances}
      label={`Triangle board, ${layout.cells.length} triangular cells`}
      theme={theme}
      mode={mode}
      opponent={opponent}
      p1Cells={p1Cells}
      p2Cells={p2Cells}
      showTerritoryOverlay={showTerritoryOverlay}
      lastMovingPlayer={lastMovingPlayer}
      showColorSymbols={showColorSymbols}
      frameWidth={frameWidth}
      boardPx={boardPx}
    />
  );
};
