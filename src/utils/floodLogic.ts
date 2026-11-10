import { BotDifficulty, PlayerId, GridSize, ColorCount, BoardShape } from '../types';
import { assertNever } from './boardShape';
import {
  bestWheelMultiplayerMove,
  checkWheelMultiplayerGameOver,
  expandWheelTerritory,
  generateTwoPlayerWheel,
} from './circleEngine';
import {
  bestCubeMultiplayerMove,
  checkCubeMultiplayerGameOver,
  expandCubeTerritory,
  generateTwoPlayerCube,
} from './cubeEngine';
import {
  bestMosaicMultiplayerMove,
  checkMosaicMultiplayerGameOver,
  expandMosaicTerritory,
  generateTwoPlayerMosaic,
} from './mosaicEngine';
import {
  bestTriangleMultiplayerMove,
  checkTriangleMultiplayerGameOver,
  expandTriangleTerritory,
  generateTwoPlayerTriangle,
} from './triangleEngine';
import {
  bestHiveMultiplayerMove,
  checkHiveMultiplayerGameOver,
  expandHiveTerritory,
  generateTwoPlayerHive,
} from './hiveEngine';
import {
  connectedRegionFlat,
  countRegionFlat,
  expandTerritoryFlat,
  bestMultiplayerMoveFlat,
  bestSoloMoveFlat,
  checkMultiplayerGameOverFlat,
  floodFlat,
  generateSoloGridFlat,
  generateTwoPlayerGridFlat,
  legalColorsFlat,
  toFlat,
  toNested,
  type BotMoveOptions,
  type Rng,
} from './engine';

/**
 * Compatibility adapter layer. The single source of truth for game rules lives in
 * `engine.ts` (flat typed arrays + index BFS) and is shared by client and server;
 * this module preserves the original nested-grid / string-key API for existing callers.
 */

/**
 * P9: topology-aware adapters. Square callers keep using the flat engine; wheel
 * callers get the polar kernels. Everything two-player (local match, server
 * rooms, online optimistic moves) goes through these, so the rules can never
 * diverge between client and server.
 */

/** Cell count of any supported board: square side² or wheel rings × sectors. */
export const cellCountOf = (grid: number[][]): number =>
  grid.length * (grid[0]?.length ?? 0);

export const generateBoardForShape = (
  shape: BoardShape,
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
  layoutSeed: number = 0,
): TwoPlayerGridResult => {
  switch (shape) {
    case 'wheel':
      return generateTwoPlayerWheel(size, colorCount, rng);
    case 'cube':
      return generateTwoPlayerCube(size, colorCount, rng);
    case 'mosaic':
      return generateTwoPlayerMosaic(size, colorCount, rng, layoutSeed);
    case 'triangle':
      return generateTwoPlayerTriangle(size, colorCount, rng);
    case 'hive':
      return generateTwoPlayerHive(size, colorCount, rng);
    case 'classic':
      return generateTwoPlayerGrid(size, colorCount, rng);
    default:
      return assertNever(shape);
  }
};

export const expandTerritoryForShape = (
  shape: BoardShape,
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
  layoutSeed: number = 0,
): { newGrid: number[][]; newCells: string[]; gain: number } => {
  switch (shape) {
    case 'wheel':
      return expandWheelTerritory(grid, currentCells, opponentCells, targetColor);
    case 'cube':
      return expandCubeTerritory(grid, currentCells, opponentCells, targetColor);
    case 'mosaic':
      return expandMosaicTerritory(
        grid,
        currentCells,
        opponentCells,
        targetColor,
        layoutSeed,
      );
    case 'triangle':
      return expandTriangleTerritory(grid, currentCells, opponentCells, targetColor);
    case 'hive':
      return expandHiveTerritory(grid, currentCells, opponentCells, targetColor);
    case 'classic':
      return expandPlayerTerritory(grid, currentCells, opponentCells, targetColor);
    default:
      return assertNever(shape);
  }
};

export const checkGameOverForShape = (
  shape: BoardShape,
  grid: number[][],
  p1Cells: string[],
  p2Cells: string[],
  colorCount: number,
  p1Color: number,
  p2Color: number,
  layoutSeed: number = 0,
): 'playing' | 'p1_won' | 'p2_won' | 'draw' => {
  const totalCells = cellCountOf(grid);
  switch (shape) {
    case 'wheel':
      return checkWheelMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
      );
    case 'cube':
      return checkCubeMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
      );
    case 'mosaic':
      return checkMosaicMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
        layoutSeed,
      );
    case 'triangle':
      return checkTriangleMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
      );
    case 'hive':
      return checkHiveMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
      );
    case 'classic':
      return checkMultiplayerGameOver(
        totalCells,
        p1Cells.length,
        p2Cells.length,
        colorCount,
        p1Color,
        p2Color,
        grid,
        p1Cells,
        p2Cells,
      );
    default:
      return assertNever(shape);
  }
};

/** Bot / hint choice on either topology (same difficulty ladder). */
export const getBestMoveForShape = (
  shape: BoardShape,
  grid: number[][],
  activePlayer: PlayerId,
  p1Cells: string[],
  p2Cells: string[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  difficulty: BotDifficulty = 'master',
  options: BotMoveOptions = {},
  layoutSeed: number = 0,
): { bestColor: number; maxGain: number } => {
  switch (shape) {
    case 'wheel':
      return bestWheelMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
      );
    case 'cube':
      return bestCubeMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
      );
    case 'mosaic':
      return bestMosaicMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
        options.rng ?? Math.random,
        layoutSeed,
      );
    case 'triangle':
      return bestTriangleMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
        options.rng ?? Math.random,
      );
    case 'hive':
      return bestHiveMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
        options.rng ?? Math.random,
      );
    case 'classic':
      return getBestMultiplayerMove(
        grid,
        activePlayer,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        colorCount,
        difficulty,
        options,
      );
    default:
      return assertNever(shape);
  }
};

export const COLORS = [
  '#FF595E', // 0: Coral Red
  '#FFCA3A', // 1: Warm Yellow
  '#8AC926', // 2: Vivid Green
  '#1982C4', // 3: Bright Blue
  '#6A4C93', // 4: Royal Purple
  '#FF924C', // 5: Sunset Orange
  '#00B4D8', // 6: Cyan Teal
  '#E0115F', // 7: Ruby Rose
];

export const COLOR_NAMES = [
  'Coral Red',
  'Sunburst',
  'Lime Green',
  'Ocean Blue',
  'Purple',
  'Orange',
  'Cyan',
  'Ruby',
];

export const GRID_SIZES: GridSize[] = [10, 12, 14, 16, 18];
export const COLOR_COUNTS: ColorCount[] = [4, 5, 6, 7, 8];

const idxToKey = (idx: number, size: number): string => {
  const r = Math.floor(idx / size);
  const c = idx % size;
  return `${r},${c}`;
};

const keysToIdx = (keys: string[], size: number): number[] =>
  keys.map((k) => {
    const [r, c] = k.split(',').map(Number);
    return r * size + c;
  });

// --- Solo Utilities ---

export const generateSoloGrid = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): number[][] => toNested(generateSoloGridFlat(size, colorCount, rng), size);

export const getMaxSoloMoves = (size: number, colorCount: number): number => {
  return Math.floor(size * 1.5 + colorCount * 2);
};

export const floodSolo = (grid: number[][], targetColor: number): number[][] => {
  const startColor = grid[0][0];
  if (startColor === targetColor) return grid;
  const size = grid.length;
  return toNested(floodFlat(toFlat(grid), size, targetColor), size);
};

export const checkSoloWin = (grid: number[][]): boolean => {
  const firstColor = grid[0][0];
  return grid.every((row) => row.every((cell) => cell === firstColor));
};

export const countConnectedSolo = (grid: number[][]): number => {
  const size = grid.length;
  return countRegionFlat(toFlat(grid), size);
};

export const getBestSoloMove = (grid: number[][], colorCount: number): number | null => {
  const size = grid.length;
  return bestSoloMoveFlat(toFlat(grid), size, colorCount);
};

// --- Multiplayer (Territory Flood) Utilities ---

/**
 * Finds all cells connected to a starting coordinate that have the given color.
 * Returned in BFS discovery order ("r,c" keys), matching the legacy implementation.
 */
export const findConnectedComponent = (
  grid: number[][],
  startR: number,
  startC: number,
  targetColor: number,
): string[] => {
  const size = grid.length;
  const startIdx = startR * size + startC;
  return connectedRegionFlat(toFlat(grid), size, startIdx, targetColor).map((idx) =>
    idxToKey(idx, size),
  );
};

export interface TwoPlayerGridResult {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

/**
 * Generate a fair 2-Player grid where:
 * - Top-left (0,0) and Bottom-right (size-1, size-1) have different colors.
 * - Their starting territories do not overlap.
 */
export const generateTwoPlayerGrid = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): TwoPlayerGridResult => {
  const board = generateTwoPlayerGridFlat(size, colorCount, rng);
  return {
    grid: toNested(board.cells, size),
    p1Cells: board.p1Idx.map((idx) => idxToKey(idx, size)),
    p2Cells: board.p2Idx.map((idx) => idxToKey(idx, size)),
    p1Color: board.p1Color,
    p2Color: board.p2Color,
  };
};

/**
 * Simulates or performs player territory expansion with a new chosen color.
 * `newCells` keeps insertion order (original cells, then BFS discoveries).
 */
export const expandPlayerTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
): {
  newGrid: number[][];
  newCells: string[];
  gain: number;
} => {
  const size = grid.length;
  const currentIdx = keysToIdx(currentCells, size);
  const opponentIdx = keysToIdx(opponentCells, size);
  const { newGrid, newCells, gain } = expandTerritoryFlat(
    toFlat(grid),
    size,
    currentIdx,
    opponentIdx,
    targetColor,
  );
  return {
    newGrid: toNested(newGrid, size),
    newCells: newCells.map((idx) => idxToKey(idx, size)),
    gain,
  };
};

/**
 * Determines legal colors for the current player in 2-player mode.
 * Neither player can pick their own color or their opponent's color.
 */
export const getLegalMultiplayerColors = (
  p1Color: number,
  p2Color: number,
  colorCount: number,
): number[] => legalColorsFlat(p1Color, p2Color, colorCount);

/**
 * Evaluates the best multiplayer move for a player or AI Bot.
 */
export const getBestMultiplayerMove = (
  grid: number[][],
  activePlayer: PlayerId,
  p1Cells: string[],
  p2Cells: string[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  difficulty: BotDifficulty = 'master',
  options: BotMoveOptions = {},
): { bestColor: number; maxGain: number; evaluations: Record<number, number> } => {
  const size = grid.length;
  return bestMultiplayerMoveFlat(
    toFlat(grid),
    size,
    activePlayer,
    keysToIdx(p1Cells, size),
    keysToIdx(p2Cells, size),
    p1Color,
    p2Color,
    colorCount,
    difficulty,
    options,
  );
};

/**
 * Checks if the multiplayer game has reached a terminal condition.
 */
export const checkMultiplayerGameOver = (
  totalCells: number,
  p1Count: number,
  p2Count: number,
  colorCount: number,
  p1Color: number,
  p2Color: number,
  grid: number[][],
  p1Cells: string[],
  p2Cells: string[],
): 'playing' | 'p1_won' | 'p2_won' | 'draw' => {
  const size = grid.length;
  return checkMultiplayerGameOverFlat(
    totalCells,
    p1Count,
    p2Count,
    colorCount,
    p1Color,
    p2Color,
    toFlat(grid),
    size,
    keysToIdx(p1Cells, size),
    keysToIdx(p2Cells, size),
  );
};
