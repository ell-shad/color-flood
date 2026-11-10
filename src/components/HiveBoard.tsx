import React, { useMemo } from 'react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
import { hiveDistanceField, hiveLayout, hiveSeedCell } from '../utils/hiveEngine';
import { TilingBoard } from './TilingBoard';

interface HiveBoardProps {
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

export const HiveBoard: React.FC<HiveBoardProps> = ({
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
  const rows = grid.length || size;
  const cols = grid[0]?.length ?? size;
  const layout = useMemo(() => hiveLayout(rows, cols), [rows, cols]);
  const seedCell = hiveSeedCell(rows, cols);
  const distances = useMemo(() => {
    if (mode !== 'multiplayer') return hiveDistanceField(rows, cols);
    const activeKey = lastMovingPlayer === 2 ? p2Cells[0] : p1Cells[0];
    const [r, c] = (activeKey ?? `${seedCell[0]},${seedCell[1]}`).split(',').map(Number);
    const start = r * cols + c;
    const distances = new Int16Array(layout.cells.length).fill(-1);
    if (start < 0 || start >= layout.cells.length) return hiveDistanceField(rows, cols);
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
      label={`Hexagon hive board, ${layout.cells.length} hexagonal cells`}
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
