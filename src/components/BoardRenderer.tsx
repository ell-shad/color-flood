import React from 'react';
import type { BoardShape, GameMode, GameTheme, MultiplayerOpponent } from '../types';
import { assertNever } from '../utils/boardShape';
import { GameGrid } from './GameGrid';
import { WheelBoard } from './WheelBoard';
import { CubeBoard } from './CubeBoard';
import { MosaicBoard } from './MosaicBoard';
import { TriangleBoard } from './TriangleBoard';
import { HiveBoard } from './HiveBoard';

/**
 * P11.4: one exhaustive board switch for App and ReplayModal.
 * Classic stays on GameGrid; wheel, cube and mosaic keep their dedicated
 * renderers.
 */
export interface BoardRendererProps {
  shape: BoardShape;
  grid: number[][];
  /** Ladder size (10–18), used by topology-specific geometry. */
  size: number;
  theme?: GameTheme;
  mode?: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
  layoutSeed?: number;
  lastMovingPlayer?: 1 | 2;
}

export const BoardRenderer: React.FC<BoardRendererProps> = ({
  shape,
  grid,
  size,
  theme,
  mode = 'solo',
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  showColorSymbols = false,
  frameWidth,
  boardPx,
  layoutSeed = 0,
  lastMovingPlayer = 1,
}) => {
  switch (shape) {
    case 'wheel':
      return (
        <WheelBoard
          grid={grid}
          size={size}
          theme={theme}
          showColorSymbols={showColorSymbols}
          frameWidth={frameWidth}
          boardPx={boardPx}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
        />
      );
    case 'cube':
      return (
        <CubeBoard
          grid={grid}
          size={size}
          theme={theme}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
          showColorSymbols={showColorSymbols}
          frameWidth={frameWidth}
          boardPx={boardPx}
          lastMovingPlayer={lastMovingPlayer}
        />
      );
    case 'mosaic':
      return (
        <MosaicBoard
          grid={grid}
          size={size}
          theme={theme}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
          showColorSymbols={showColorSymbols}
          frameWidth={frameWidth}
          boardPx={boardPx}
          lastMovingPlayer={lastMovingPlayer}
          layoutSeed={layoutSeed}
        />
      );
    case 'triangle':
      return (
        <TriangleBoard
          grid={grid}
          size={size}
          theme={theme}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
          showColorSymbols={showColorSymbols}
          frameWidth={frameWidth}
          boardPx={boardPx}
          lastMovingPlayer={lastMovingPlayer}
        />
      );
    case 'hive':
      return (
        <HiveBoard
          grid={grid}
          size={size}
          theme={theme}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
          showColorSymbols={showColorSymbols}
          frameWidth={frameWidth}
          boardPx={boardPx}
          lastMovingPlayer={lastMovingPlayer}
        />
      );
    case 'classic':
      return (
        <GameGrid
          grid={grid}
          gridSize={grid.length || size}
          mode={mode}
          opponent={opponent}
          p1Cells={p1Cells}
          p2Cells={p2Cells}
          showTerritoryOverlay={showTerritoryOverlay}
          showColorSymbols={showColorSymbols}
          lastMovingPlayer={lastMovingPlayer}
          theme={theme}
          boardPx={boardPx}
        />
      );
    default:
      return assertNever(shape as never);
  }
};
