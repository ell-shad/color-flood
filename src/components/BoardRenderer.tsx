import React, { Suspense, lazy } from 'react';
import type { BoardShape, GameMode, GameTheme, MultiplayerOpponent } from '../types';
import { assertNever } from '../utils/boardShape';
import { THEMES } from '../utils/themes';
import { GameGrid } from './GameGrid';

const WheelBoard = lazy(() =>
  import('./WheelBoard').then((m) => ({ default: m.WheelBoard })),
);
const CubeBoard = lazy(() =>
  import('./CubeBoard').then((m) => ({ default: m.CubeBoard })),
);
const MosaicBoard = lazy(() =>
  import('./MosaicBoard').then((m) => ({ default: m.MosaicBoard })),
);
const TriangleBoard = lazy(() =>
  import('./TriangleBoard').then((m) => ({ default: m.TriangleBoard })),
);
const HiveBoard = lazy(() =>
  import('./HiveBoard').then((m) => ({ default: m.HiveBoard })),
);

/**
 * P11.4: one exhaustive board switch for App and ReplayModal.
 * Classic stays synchronous for instant first-frame paint; alternate shapes
 * lazy-load inside a matched-footprint skeleton to avoid layout jump.
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

const BoardSkeleton: React.FC<{
  theme: GameTheme;
  frameWidth?: string;
  boardPx?: number;
}> = ({ theme, frameWidth, boardPx }) => (
  <div
    className={`relative ${theme.boardBg} p-1.5 sm:p-2 rounded-2xl border ${theme.boardBorder} shadow-2xl mx-auto shrink-0 flex items-center justify-center animate-pulse`}
    style={{
      width: boardPx ? `${boardPx}px` : (frameWidth ?? 'min(88vw, min(40vh, 380px))'),
      height: boardPx ? `${boardPx}px` : undefined,
      aspectRatio: boardPx ? undefined : '1/1',
    }}
    aria-label="Loading board"
  >
    <div className="w-full h-full rounded-xl bg-slate-950/40" />
  </div>
);

export const BoardRenderer: React.FC<BoardRendererProps> = ({
  shape,
  grid,
  size,
  theme = THEMES.arcade,
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
  const skeleton = (
    <BoardSkeleton theme={theme} frameWidth={frameWidth} boardPx={boardPx} />
  );

  switch (shape) {
    case 'wheel':
      return (
        <Suspense fallback={skeleton}>
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
        </Suspense>
      );
    case 'cube':
      return (
        <Suspense fallback={skeleton}>
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
        </Suspense>
      );
    case 'mosaic':
      return (
        <Suspense fallback={skeleton}>
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
        </Suspense>
      );
    case 'triangle':
      return (
        <Suspense fallback={skeleton}>
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
        </Suspense>
      );
    case 'hive':
      return (
        <Suspense fallback={skeleton}>
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
        </Suspense>
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
