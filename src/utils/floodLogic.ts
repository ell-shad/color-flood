/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BotDifficulty, PlayerId, GridSize, ColorCount } from '../types';

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

// --- Solo Utilities ---

export const generateSoloGrid = (size: number, colorCount: number): number[][] => {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.floor(Math.random() * colorCount)),
  );
};

export const getMaxSoloMoves = (size: number, colorCount: number): number => {
  return Math.floor(size * 1.5 + colorCount * 2);
};

export const floodSolo = (grid: number[][], targetColor: number): number[][] => {
  const size = grid.length;
  const startColor = grid[0][0];
  if (startColor === targetColor) return grid;

  const newGrid = grid.map((row) => [...row]);
  const queue: [number, number][] = [[0, 0]];
  const visited = new Set<string>();
  visited.add('0,0');

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    newGrid[r][c] = targetColor;

    const neighbors = [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ];

    for (const [nr, nc] of neighbors) {
      if (
        nr >= 0 &&
        nr < size &&
        nc >= 0 &&
        nc < size &&
        !visited.has(`${nr},${nc}`) &&
        grid[nr][nc] === startColor
      ) {
        visited.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }
  return newGrid;
};

export const checkSoloWin = (grid: number[][]): boolean => {
  const firstColor = grid[0][0];
  return grid.every((row) => row.every((cell) => cell === firstColor));
};

export const countConnectedSolo = (grid: number[][]): number => {
  const size = grid.length;
  const startColor = grid[0][0];
  const queue: [number, number][] = [[0, 0]];
  const visited = new Set<string>();
  visited.add('0,0');
  let count = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    count++;

    const neighbors = [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ];

    for (const [nr, nc] of neighbors) {
      if (
        nr >= 0 &&
        nr < size &&
        nc >= 0 &&
        nc < size &&
        !visited.has(`${nr},${nc}`) &&
        grid[nr][nc] === startColor
      ) {
        visited.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }
  return count;
};

export const getBestSoloMove = (grid: number[][], colorCount: number): number | null => {
  let bestColor = -1;
  let maxNewCells = -1;

  for (let i = 0; i < colorCount; i++) {
    if (i === grid[0][0]) continue;
    const testGrid = floodSolo(grid, i);
    const connectedCells = countConnectedSolo(testGrid);

    if (connectedCells > maxNewCells) {
      maxNewCells = connectedCells;
      bestColor = i;
    }
  }
  return bestColor !== -1 ? bestColor : null;
};

// --- Multiplayer (Territory Flood) Utilities ---

/**
 * Finds all cells connected to a starting coordinate that have the given color.
 */
export const findConnectedComponent = (
  grid: number[][],
  startR: number,
  startC: number,
  targetColor: number,
): string[] => {
  const size = grid.length;
  const queue: [number, number][] = [[startR, startC]];
  const visited = new Set<string>();
  visited.add(`${startR},${startC}`);
  const result: string[] = [`${startR},${startC}`];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const neighbors = [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ];

    for (const [nr, nc] of neighbors) {
      if (
        nr >= 0 &&
        nr < size &&
        nc >= 0 &&
        nc < size &&
        !visited.has(`${nr},${nc}`) &&
        grid[nr][nc] === targetColor
      ) {
        visited.add(`${nr},${nc}`);
        result.push(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }
  return result;
};

/**
 * Generate a fair 2-Player grid where:
 * - Top-left (0,0) and Bottom-right (size-1, size-1) have different colors.
 * - Their starting territories do not overlap.
 */
export const generateTwoPlayerGrid = (
  size: number,
  colorCount: number,
): {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
} => {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const grid = generateSoloGrid(size, colorCount);

    const p1Color = grid[0][0];
    let p2Color = grid[size - 1][size - 1];

    if (p2Color === p1Color) {
      // Pick a different color for P2
      p2Color = (p1Color + 1 + Math.floor(Math.random() * (colorCount - 1))) % colorCount;
      grid[size - 1][size - 1] = p2Color;
    }

    const p1Cells = findConnectedComponent(grid, 0, 0, p1Color);
    const p2Cells = findConnectedComponent(grid, size - 1, size - 1, p2Color);

    const p2Set = new Set(p2Cells);
    const hasOverlap = p1Cells.some((c) => p2Set.has(c));

    if (!hasOverlap) {
      return { grid, p1Cells, p2Cells, p1Color, p2Color };
    }
  }

  // Fallback guaranteed separation
  const grid = generateSoloGrid(size, colorCount);
  const p1Color = 0;
  const p2Color = 1;
  grid[0][0] = p1Color;
  grid[size - 1][size - 1] = p2Color;
  const p1Cells = findConnectedComponent(grid, 0, 0, p1Color);
  const p2Cells = findConnectedComponent(grid, size - 1, size - 1, p2Color);
  return { grid, p1Cells, p2Cells, p1Color, p2Color };
};

/**
 * Simulates or performs player territory expansion with a new chosen color.
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
  const newGrid = grid.map((row) => [...row]);
  const opponentSet = new Set(opponentCells);
  const updatedSet = new Set(currentCells);
  const queue: [number, number][] = [];

  // Update all current territory cells to the new color
  for (const cellKey of currentCells) {
    const [r, c] = cellKey.split(',').map(Number);
    newGrid[r][c] = targetColor;
    queue.push([r, c]);
  }

  // Flood fill into adjacent cells of color `targetColor` that are not owned by the opponent
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const neighbors = [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ];

    for (const [nr, nc] of neighbors) {
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        const key = `${nr},${nc}`;
        if (
          !updatedSet.has(key) &&
          !opponentSet.has(key) &&
          newGrid[nr][nc] === targetColor
        ) {
          updatedSet.add(key);
          queue.push([nr, nc]);
        }
      }
    }
  }

  const newCells = Array.from(updatedSet);
  return {
    newGrid,
    newCells,
    gain: newCells.length - currentCells.length,
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
): number[] => {
  const legal: number[] = [];
  for (let i = 0; i < colorCount; i++) {
    if (i !== p1Color && i !== p2Color) {
      legal.push(i);
    }
  }
  return legal;
};

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
): { bestColor: number; maxGain: number; evaluations: Record<number, number> } => {
  const currentCells = activePlayer === 1 ? p1Cells : p2Cells;
  const opponentCells = activePlayer === 1 ? p2Cells : p1Cells;
  const myColor = activePlayer === 1 ? p1Color : p2Color;
  const oppColor = activePlayer === 1 ? p2Color : p1Color;

  const legalColors = getLegalMultiplayerColors(myColor, oppColor, colorCount);
  const evaluations: Record<number, number> = {};

  if (legalColors.length === 0) {
    return { bestColor: 0, maxGain: 0, evaluations: {} };
  }

  // Compute gain for each legal color
  for (const c of legalColors) {
    const { gain } = expandPlayerTerritory(grid, currentCells, opponentCells, c);
    evaluations[c] = gain;
  }

  // Easy Bot: 60% chance to pick random legal color, 40% best
  if (difficulty === 'easy') {
    if (Math.random() < 0.6) {
      const randomColor = legalColors[Math.floor(Math.random() * legalColors.length)];
      return {
        bestColor: randomColor,
        maxGain: evaluations[randomColor] || 0,
        evaluations,
      };
    }
  }

  // Medium Bot: purely greedy (highest immediate gain)
  if (difficulty === 'medium') {
    let bestC = legalColors[0];
    let maxG = -1;
    for (const c of legalColors) {
      const g = evaluations[c];
      if (g > maxG) {
        maxG = g;
        bestC = c;
      }
    }
    return { bestColor: bestC, maxGain: maxG, evaluations };
  }

  // Master Bot: Lookahead / Minimax-heuristic:
  // Maximizes myGain - (0.7 * opponent's max reply gain) + territory position value
  let bestScore = -Infinity;
  let bestColor = legalColors[0];

  for (const c of legalColors) {
    const { newGrid, newCells, gain } = expandPlayerTerritory(
      grid,
      currentCells,
      opponentCells,
      c,
    );

    // Simulate opponent's best response
    const opponentLegal = getLegalMultiplayerColors(c, oppColor, colorCount);
    let maxOppGain = 0;
    for (const oppC of opponentLegal) {
      const oppSimulation = expandPlayerTerritory(newGrid, opponentCells, newCells, oppC);
      if (oppSimulation.gain > maxOppGain) {
        maxOppGain = oppSimulation.gain;
      }
    }

    // Heuristic score: High personal gain, deny opponent gain
    const strategicScore = gain * 1.5 - maxOppGain * 0.8;
    if (strategicScore > bestScore) {
      bestScore = strategicScore;
      bestColor = c;
    }
  }

  return {
    bestColor,
    maxGain: evaluations[bestColor] || 0,
    evaluations,
  };
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
  const majorityThreshold = Math.floor(totalCells / 2) + 1;

  // Immediate majority winner
  if (p1Count >= majorityThreshold) return 'p1_won';
  if (p2Count >= majorityThreshold) return 'p2_won';

  // All cells occupied
  if (p1Count + p2Count >= totalCells) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  // Check if both players are blocked from making any expansions
  const p1Legal = getLegalMultiplayerColors(p1Color, p2Color, colorCount);
  const p2Legal = getLegalMultiplayerColors(p2Color, p1Color, colorCount);

  const p1CanGain = p1Legal.some((c) => {
    const { gain } = expandPlayerTerritory(grid, p1Cells, p2Cells, c);
    return gain > 0;
  });

  const p2CanGain = p2Legal.some((c) => {
    const { gain } = expandPlayerTerritory(grid, p2Cells, p1Cells, c);
    return gain > 0;
  });

  // If both players can no longer capture new cells
  if (!p1CanGain && !p2CanGain) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  return 'playing';
};
