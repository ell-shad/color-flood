import { describe, it, expect } from 'vitest';
import {
  WHEEL_GEOMETRY,
  bestWheelMultiplayerMove,
  checkWheelMultiplayerGameOver,
  expandWheelTerritory,
  generateTwoPlayerWheel,
  wheelCellCount,
} from './circleEngine';
import { mulberry32 } from './engine';

/**
 * P9: two-player wheel rules. Seeds sit on opposite points of the outer ring
 * (the polar analogue of the square's opposite corners), expansion follows the
 * wrapping ring, and the win check mirrors the square's majority/blocked rules.
 */
describe('P9 two-player wheel — generation', () => {
  it('seeds both players on opposite outer-ring sectors with distinct colors', () => {
    for (const size of [10, 14, 18]) {
      const { rings, sectors } = WHEEL_GEOMETRY[size];
      for (let seed = 0; seed < 25; seed++) {
        const board = generateTwoPlayerWheel(size, 4, mulberry32(seed * 7919 + size));
        expect(board.grid.length).toBe(rings);
        expect(board.grid.every((row) => row.length === sectors)).toBe(true);
        expect(board.grid.length * board.grid[0].length).toBe(wheelCellCount(size));

        const p1Seed = board.p1Cells[0].split(',').map(Number);
        const p2Seed = board.p2Cells[0].split(',').map(Number);
        expect(p1Seed).toEqual([rings - 1, 0]);
        expect(p2Seed).toEqual([rings - 1, Math.floor(sectors / 2)]);
        expect(board.p1Color).not.toBe(board.p2Color);
        // Seed cells carry their owner's color.
        expect(board.grid[p1Seed[0]][p1Seed[1]]).toBe(board.p1Color);
        expect(board.grid[p2Seed[0]][p2Seed[1]]).toBe(board.p2Color);

        // Starting territories never overlap.
        const p2Set = new Set(board.p2Cells);
        expect(board.p1Cells.some((k) => p2Set.has(k))).toBe(false);
      }
    }
  });
});

describe('P9 two-player wheel — expansion', () => {
  // Handcrafted 3 rings × 8 sectors (kernels read the grid, not the ladder).
  const base = () => [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 1],
  ];

  it('recolors own cells and floods into neutral cells of the chosen color', () => {
    const grid = base();
    const { newGrid, newCells, gain } = expandWheelTerritory(grid, ['2,0'], ['1,4'], 1);
    expect(newGrid[2][0]).toBe(1);
    // (2,1) is inward-adjacent? no: sector neighbour; (1,0) is inward; (2,7) wraps.
    // Neighbour order: clockwise sector, counter-clockwise sector, then inward.
    expect(newCells).toEqual(['2,0', '2,1', '2,7', '1,0']);
    expect(gain).toBe(3);
    // Pure: the input board is untouched.
    expect(grid[2][0]).toBe(0);
    expect(grid[2][1]).toBe(1);
  });

  it('never expands through an opponent cell', () => {
    const grid = base();
    const { newGrid, gain } = expandWheelTerritory(grid, ['2,0'], ['1,0'], 1);
    expect(gain).toBe(2); // only (2,1) and the wrapping (2,7)
    expect(newGrid[1][0]).toBe(1); // still the board color, untouched by us
  });

  it('rejects the move when the target color already is the own color', () => {
    const grid = base();
    const { newCells, gain } = expandWheelTerritory(grid, ['2,0'], [], 0);
    expect(newCells).toEqual(['2,0']);
    expect(gain).toBe(0);
  });
});

describe('P9 two-player wheel — outcome and bot', () => {
  it('ends on majority, on a full board, and when neither side can gain', () => {
    const grid = [
      [0, 0, 0, 0],
      [0, 1, 0, 1],
    ];
    // 13 of 24 is a majority (8-cell wheel below is the blocked case).
    expect(checkWheelMultiplayerGameOver(24, 13, 11, 4, 0, 1, grid, [], [])).toBe('p1_won');
    expect(checkWheelMultiplayerGameOver(24, 11, 13, 4, 0, 1, grid, [], [])).toBe('p2_won');
    // No legal color for either side and equal counts → draw.
    expect(checkWheelMultiplayerGameOver(8, 1, 1, 2, 0, 1, grid, ['1,0'], ['1,2'])).toBe(
      'draw',
    );
    // No legal color, unequal counts → the larger territory wins.
    expect(checkWheelMultiplayerGameOver(8, 2, 1, 2, 0, 1, grid, ['1,0'], ['1,2'])).toBe(
      'p1_won',
    );
  });

  it('picks a legal color that gains territory', () => {
    const grid = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0],
    ];
    for (const difficulty of ['easy', 'medium', 'master'] as const) {
      const { bestColor, maxGain } = bestWheelMultiplayerMove(
        grid,
        1,
        ['2,0'],
        ['1,4'],
        0,
        1,
        4,
        difficulty,
        mulberry32(11),
      );
      // Color 1 is the opponent's live color, so only 2/3 are legal here.
      expect([2, 3]).toContain(bestColor);
      expect(maxGain).toBeGreaterThanOrEqual(0);
    }
  });
});
