import { describe, it, expect } from 'vitest';

import {
  generateSoloGrid,
  floodSolo,
  countConnectedSolo,
  getBestSoloMove,
  findConnectedComponent,
  generateTwoPlayerGrid,
  expandPlayerTerritory,
  getBestMultiplayerMove,
  getLegalMultiplayerColors,
  checkMultiplayerGameOver,
} from './floodLogic';
import {
  mulberry32,
  toFlat,
  toNested,
  generateSoloGridFlat,
  bestMultiplayerMoveLegacyMasterFlat,
} from './engine';

// Same key format as floodLogic's private keysToIdx ('r,c' row-major).
const testKeysToIdx = (keys: string[], size: number): number[] =>
  keys.map((k) => Number(k.split(',')[0]) * size + Number(k.split(',')[1]));

/**
 * PARITY SUITE — the reference implementation (string keys, Set<string>, queue.shift()
 * BFS) is reproduced verbatim below and compared against the current engine with seeded
 * RNG. Any future engine change that alters observable behavior must fail here first.
 */

const legacyGenerateSoloGrid = (size: number, colorCount: number, rng: () => number) =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.floor(rng() * colorCount)),
  );

const legacyFloodSolo = (grid: number[][], targetColor: number): number[][] => {
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

const legacyFindConnectedComponent = (
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

const legacyExpandPlayerTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
) => {
  const size = grid.length;
  const newGrid = grid.map((row) => [...row]);
  const opponentSet = new Set(opponentCells);
  const updatedSet = new Set(currentCells);
  const queue: [number, number][] = [];

  for (const cellKey of currentCells) {
    const [r, c] = cellKey.split(',').map(Number);
    newGrid[r][c] = targetColor;
    queue.push([r, c]);
  }

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
  return { newGrid, newCells, gain: newCells.length - currentCells.length };
};

interface LegacyBoard {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

const legacyGenerateTwoPlayerGrid = (
  size: number,
  colorCount: number,
  rng: () => number,
): LegacyBoard => {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const grid = legacyGenerateSoloGrid(size, colorCount, rng);

    const p1Color = grid[0][0];
    let p2Color = grid[size - 1][size - 1];

    if (p2Color === p1Color) {
      p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
      grid[size - 1][size - 1] = p2Color;
    }

    const p1Cells = legacyFindConnectedComponent(grid, 0, 0, p1Color);
    const p2Cells = legacyFindConnectedComponent(grid, size - 1, size - 1, p2Color);

    const p2Set = new Set(p2Cells);
    const hasOverlap = p1Cells.some((c) => p2Set.has(c));

    if (!hasOverlap) {
      return { grid, p1Cells, p2Cells, p1Color, p2Color };
    }
  }

  const grid = legacyGenerateSoloGrid(size, colorCount, rng);
  const p1Color = 0;
  const p2Color = 1;
  grid[0][0] = p1Color;
  grid[size - 1][size - 1] = p2Color;
  const p1Cells = legacyFindConnectedComponent(grid, 0, 0, p1Color);
  const p2Cells = legacyFindConnectedComponent(grid, size - 1, size - 1, p2Color);
  return { grid, p1Cells, p2Cells, p1Color, p2Color };
};

const legacyBestMultiplayerMove = (
  board: LegacyBoard,
  activePlayer: 1 | 2,
  colorCount: number,
  difficulty: 'medium' | 'master',
): { bestColor: number; maxGain: number; evaluations: Record<number, number> } => {
  const grid = board.grid;
  const currentCells = activePlayer === 1 ? board.p1Cells : board.p2Cells;
  const opponentCells = activePlayer === 1 ? board.p2Cells : board.p1Cells;
  const myColor = activePlayer === 1 ? board.p1Color : board.p2Color;
  const oppColor = activePlayer === 1 ? board.p2Color : board.p1Color;

  const legalColors = getLegalMultiplayerColors(myColor, oppColor, colorCount);
  const evaluations: Record<number, number> = {};

  if (legalColors.length === 0) {
    return { bestColor: 0, maxGain: 0, evaluations: {} };
  }

  for (const c of legalColors) {
    const { gain } = legacyExpandPlayerTerritory(grid, currentCells, opponentCells, c);
    evaluations[c] = gain;
  }

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

  let bestScore = -Infinity;
  let bestColor = legalColors[0];
  for (const c of legalColors) {
    const { newGrid, newCells, gain } = legacyExpandPlayerTerritory(
      grid,
      currentCells,
      opponentCells,
      c,
    );
    const opponentLegal = getLegalMultiplayerColors(c, oppColor, colorCount);
    let maxOppGain = 0;
    for (const oppC of opponentLegal) {
      const oppSim = legacyExpandPlayerTerritory(newGrid, opponentCells, newCells, oppC);
      if (oppSim.gain > maxOppGain) {
        maxOppGain = oppSim.gain;
      }
    }
    const strategicScore = gain * 1.5 - maxOppGain * 0.8;
    if (strategicScore > bestScore) {
      bestScore = strategicScore;
      bestColor = c;
    }
  }

  return { bestColor, maxGain: evaluations[bestColor] || 0, evaluations };
};

const legacyCheckMultiplayerGameOver = (
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

  if (p1Count >= majorityThreshold) return 'p1_won';
  if (p2Count >= majorityThreshold) return 'p2_won';

  if (p1Count + p2Count >= totalCells) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  const p1Legal = getLegalMultiplayerColors(p1Color, p2Color, colorCount);
  const p2Legal = getLegalMultiplayerColors(p2Color, p1Color, colorCount);

  const p1CanGain = p1Legal.some((c) => {
    const { gain } = legacyExpandPlayerTerritory(grid, p1Cells, p2Cells, c);
    return gain > 0;
  });

  const p2CanGain = p2Legal.some((c) => {
    const { gain } = legacyExpandPlayerTerritory(grid, p2Cells, p1Cells, c);
    return gain > 0;
  });

  if (!p1CanGain && !p2CanGain) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  return 'playing';
};

describe('seedable RNG', () => {
  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('flat representation', () => {
  it('toFlat / toNested round-trip row-major', () => {
    const grid = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ];
    const flat = toFlat(grid);
    expect(flat).toEqual(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(toNested(flat, 3)).toEqual(grid);
  });

  it('toFlat rejects non-square grids explicitly', () => {
    expect(() => toFlat([[0, 1, 2]])).toThrow(RangeError);
  });

  it('generateSoloGridFlat draws rng row-major exactly size*size times', () => {
    let draws = 0;
    const grid = generateSoloGridFlat(2, 4, () => {
      draws++;
      return 0;
    });
    expect(draws).toBe(4);
    expect(grid).toEqual(Uint8Array.from([0, 0, 0, 0]));
  });
});

describe('old engine vs new engine parity (seeded)', () => {
  const sizes = [8, 10, 12, 14, 16, 18];
  const colorCounts = [4, 5, 6, 7, 8];

  it('floodSolo matches legacy flood fill for every color on many boards', () => {
    for (let seed = 0; seed < 40; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const grid = generateSoloGrid(size, colorCount, mulberry32(seed));
      const target = seed % colorCount;
      expect(floodSolo(grid, target), `seed=${seed} target=${target}`).toEqual(
        legacyFloodSolo(grid, target),
      );
    }
  });

  it('floodSolo keeps the same-reference shortcut when target equals start color', () => {
    const grid = generateSoloGrid(10, 8, mulberry32(7));
    expect(floodSolo(grid, grid[0][0])).toBe(grid);
  });

  it('countConnectedSolo matches legacy component counting', () => {
    for (let seed = 0; seed < 30; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const grid = generateSoloGrid(size, colorCount, mulberry32(seed + 1000));
      expect(countConnectedSolo(grid), `seed=${seed + 1000}`).toBe(
        legacyFindConnectedComponent(grid, 0, 0, grid[0][0]).length,
      );
    }
  });

  it('getBestSoloMove matches legacy greedy best-move', () => {
    for (let seed = 0; seed < 40; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const grid = generateSoloGrid(size, colorCount, mulberry32(seed + 2000));

      // Legacy oracle: first-max tie-break over floods
      let bestColor = -1;
      let maxNewCells = -1;
      for (let i = 0; i < colorCount; i++) {
        if (i === grid[0][0]) continue;
        const flooded = legacyFloodSolo(grid, i);
        const connected = legacyFindConnectedComponent(flooded, 0, 0, i).length;
        if (connected > maxNewCells) {
          maxNewCells = connected;
          bestColor = i;
        }
      }
      const expected = bestColor !== -1 ? bestColor : null;
      expect(getBestSoloMove(grid, colorCount), `seed=${seed + 2000}`).toBe(expected);
    }
  });

  it('findConnectedComponent matches legacy BFS order exactly', () => {
    for (let seed = 0; seed < 30; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const grid = generateSoloGrid(size, colorCount, mulberry32(seed + 3000));
      expect(
        findConnectedComponent(grid, 0, 0, grid[0][0]),
        `seed=${seed + 3000}`,
      ).toEqual(legacyFindConnectedComponent(grid, 0, 0, grid[0][0]));
    }
  });

  it('generateTwoPlayerGrid matches legacy output cell-for-cell with the same seed', () => {
    for (let seed = 0; seed < 30; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const legacy = legacyGenerateTwoPlayerGrid(
        size,
        colorCount,
        mulberry32(seed + 4000),
      );
      const current = generateTwoPlayerGrid(size, colorCount, mulberry32(seed + 4000));
      expect(current.grid, `seed=${seed + 4000}`).toEqual(legacy.grid);
      expect(current.p1Cells).toEqual(legacy.p1Cells);
      expect(current.p2Cells).toEqual(legacy.p2Cells);
      expect(current.p1Color).toBe(legacy.p1Color);
      expect(current.p2Color).toBe(legacy.p2Color);
    }
  });

  it('expandPlayerTerritory matches legacy output including insertion order', () => {
    for (let seed = 0; seed < 30; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const board = generateTwoPlayerGrid(size, colorCount, mulberry32(seed + 5000));
      const target = (board.p1Color + 1) % colorCount;

      const legacy = legacyExpandPlayerTerritory(
        board.grid,
        board.p1Cells,
        board.p2Cells,
        target,
      );
      const current = expandPlayerTerritory(
        board.grid,
        board.p1Cells,
        board.p2Cells,
        target,
      );
      expect(current.newGrid, `seed=${seed + 5000}`).toEqual(legacy.newGrid);
      expect(current.newCells).toEqual(legacy.newCells);
      expect(current.gain).toBe(legacy.gain);
    }
  });

  it('getLegalMultiplayerColors matches legacy', () => {
    for (let p1 = 0; p1 < 8; p1++) {
      for (let p2 = 0; p2 < 8; p2++) {
        for (const count of colorCounts) {
          const legacy: number[] = [];
          for (let i = 0; i < count; i++) {
            if (i !== p1 && i !== p2) legacy.push(i);
          }
          expect(getLegalMultiplayerColors(p1, p2, count)).toEqual(legacy);
        }
      }
    }
  });

  it('getBestMultiplayerMove matches legacy for medium (adapter)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const board = generateTwoPlayerGrid(size, colorCount, mulberry32(seed + 6000));

      const expected = legacyBestMultiplayerMove(board, 1, colorCount, 'medium');
      const current = getBestMultiplayerMove(
        board.grid,
        1,
        board.p1Cells,
        board.p2Cells,
        board.p1Color,
        board.p2Color,
        colorCount,
        'medium',
      );
      expect(current.bestColor, `seed=${seed + 6000} medium`).toBe(expected.bestColor);
      expect(current.evaluations).toEqual(expected.evaluations);
    }
  });

  /**
   * P2.6 deliberately changed the master bot from the one-move-lookahead heuristic to
   * alpha-beta minimax. The legacy heuristic lives on as
   * `bestMultiplayerMoveLegacyMasterFlat`; this test pins it to the verbatim legacy
   * oracle so the reference behavior stays guarded.
   */
  it('legacy master heuristic is pinned (verbatim oracle) after P2.6 minimax switch', () => {
    for (let seed = 0; seed < 25; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const board = generateTwoPlayerGrid(size, colorCount, mulberry32(seed + 6000));
      const expected = legacyBestMultiplayerMove(board, 1, colorCount, 'master');
      const legacy = bestMultiplayerMoveLegacyMasterFlat(
        toFlat(board.grid),
        size,
        1,
        testKeysToIdx(board.p1Cells, size),
        testKeysToIdx(board.p2Cells, size),
        board.p1Color,
        board.p2Color,
        colorCount,
      );
      expect(legacy.bestColor, `seed=${seed + 6000} legacy-master`).toBe(
        expected.bestColor,
      );
      expect(legacy.evaluations).toEqual(expected.evaluations);
    }
  });

  it('checkMultiplayerGameOver matches legacy through simulated games', () => {
    for (let seed = 0; seed < 25; seed++) {
      const size = sizes[seed % sizes.length];
      const colorCount = colorCounts[seed % colorCounts.length];
      const board = generateTwoPlayerGrid(size, colorCount, mulberry32(seed + 7000));
      const totalCells = size * size;

      // Drive one shared history through the legacy implementation, comparing every
      // expansion along the way; the new engine consumes the same inputs.
      let grid = board.grid;
      let p1Cells = board.p1Cells;
      let p2Cells = board.p2Cells;
      let p1Color = board.p1Color;
      let p2Color = board.p2Color;

      for (let step = 0; step < 6; step++) {
        const activePlayer = step % 2 === 0 ? (1 as const) : (2 as const);
        const me = activePlayer === 1 ? p1Color : p2Color;
        const opp = activePlayer === 1 ? p2Color : p1Color;
        const legal: number[] = [];
        for (let i = 0; i < colorCount; i++) if (i !== me && i !== opp) legal.push(i);
        if (legal.length === 0) break;
        const color = legal[(seed + step) % legal.length];

        const legacyExp = legacyExpandPlayerTerritory(
          grid,
          activePlayer === 1 ? p1Cells : p2Cells,
          activePlayer === 1 ? p2Cells : p1Cells,
          color,
        );
        const currentExp = expandPlayerTerritory(
          grid,
          activePlayer === 1 ? p1Cells : p2Cells,
          activePlayer === 1 ? p2Cells : p1Cells,
          color,
        );
        expect(currentExp.newGrid, `step=${step} seed=${seed + 7000}`).toEqual(
          legacyExp.newGrid,
        );
        expect(currentExp.newCells).toEqual(legacyExp.newCells);
        expect(currentExp.gain).toBe(legacyExp.gain);

        grid = legacyExp.newGrid;
        if (activePlayer === 1) {
          p1Cells = currentExp.newCells;
          p1Color = color;
        } else {
          p2Cells = currentExp.newCells;
          p2Color = color;
        }

        const legacyOutcome = legacyCheckMultiplayerGameOver(
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
        const currentOutcome = checkMultiplayerGameOver(
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
        expect(currentOutcome, `step=${step} seed=${seed + 7000}`).toBe(legacyOutcome);
      }
    }
  });
});
