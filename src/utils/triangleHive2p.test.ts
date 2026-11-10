import { describe, it, expect } from 'vitest';
import {
  bestTriangleMultiplayerMove,
  checkTriangleMultiplayerGameOver,
  expandTriangleTerritory,
  generateTwoPlayerTriangle,
  triangleCellCount,
  triangleSeedCell,
} from './triangleEngine';
import {
  bestHiveMultiplayerMove,
  checkHiveMultiplayerGameOver,
  expandHiveTerritory,
  generateTwoPlayerHive,
  hiveCellCount,
  hiveSeedCell,
  hiveTopSeedCell,
} from './hiveEngine';
import { mulberry32 } from './engine';

describe('two-player triangle (P14 multiplayer)', () => {
  it('seeds P1 at the bottom centre and P2 at the top centre', () => {
    for (const size of [10, 12, 18]) {
      const board = generateTwoPlayerTriangle(size, 4, mulberry32(size));
      expect(board.p1Color).not.toBe(board.p2Color);
      const rows = board.grid.length;
      const cols = board.grid[0].length;
      const [p1r, p1c] = triangleSeedCell(rows, cols);
      expect(board.p1Cells[0]).toBe(`${p1r},${p1c}`);
      expect(board.p2Cells[0]).toBe(`0,${Math.floor(cols / 2)}`);
      const p2Set = new Set(board.p2Cells);
      expect(board.p1Cells.some((k) => p2Set.has(k))).toBe(false);
      expect(rows * cols).toBe(triangleCellCount(size));
    }
  });

  it('expands territory on the visible graph and never eats opponent land', () => {
    const board = generateTwoPlayerTriangle(10, 5, mulberry32(42));
    const target = [0, 1, 2, 3, 4].find(
      (c) => c !== board.p1Color && c !== board.p2Color,
    )!;
    const { newGrid, newCells, gain } = expandTriangleTerritory(
      board.grid,
      board.p1Cells,
      board.p2Cells,
      target,
    );
    expect(newCells.slice(0, board.p1Cells.length)).toEqual(board.p1Cells);
    expect(gain).toBe(newCells.length - board.p1Cells.length);
    const opponent = new Set(board.p2Cells);
    expect(newCells.some((k) => opponent.has(k))).toBe(false);
    expect(newGrid).not.toBe(board.grid);
  });

  it('detects majority and mutually blocked outcomes', () => {
    expect(checkTriangleMultiplayerGameOver(24, 13, 11, 4, 0, 1, [], [], [])).toBe(
      'p1_won',
    );
    expect(checkTriangleMultiplayerGameOver(24, 11, 13, 4, 0, 1, [], [], [])).toBe(
      'p2_won',
    );
    expect(checkTriangleMultiplayerGameOver(24, 12, 12, 4, 0, 1, [], [], [])).toBe(
      'draw',
    );
  });

  it('uses the one-ply bot heuristic with a legal palette', () => {
    const board = generateTwoPlayerTriangle(10, 5, mulberry32(99));
    const legal = [0, 1, 2, 3, 4].filter(
      (c) => c !== board.p1Color && c !== board.p2Color,
    );
    const master = bestTriangleMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'master',
    );
    expect(legal).toContain(master.bestColor);
    expect(master.maxGain).toBe(
      expandTriangleTerritory(board.grid, board.p1Cells, board.p2Cells, master.bestColor)
        .gain,
    );
  });
});

describe('two-player hive (P14 multiplayer)', () => {
  it('seeds P1 at the bottom centre and P2 at the top centre', () => {
    for (const size of [10, 12, 18]) {
      const board = generateTwoPlayerHive(size, 4, mulberry32(size));
      expect(board.p1Color).not.toBe(board.p2Color);
      const rows = board.grid.length;
      const cols = board.grid[0].length;
      const [p1r, p1c] = hiveSeedCell(rows, cols);
      const [p2r, p2c] = hiveTopSeedCell(rows, cols);
      expect(board.p1Cells[0]).toBe(`${p1r},${p1c}`);
      expect(board.p2Cells[0]).toBe(`${p2r},${p2c}`);
      expect(p1r).toBe(rows - 1);
      expect(p2r).toBe(0);
      const p2Set = new Set(board.p2Cells);
      expect(board.p1Cells.some((k) => p2Set.has(k))).toBe(false);
      expect(rows * cols).toBe(hiveCellCount(size));
    }
  });

  it('expands territory on the honeycomb and never eats opponent land', () => {
    const board = generateTwoPlayerHive(10, 5, mulberry32(42));
    const target = [0, 1, 2, 3, 4].find(
      (c) => c !== board.p1Color && c !== board.p2Color,
    )!;
    const { newGrid, newCells, gain } = expandHiveTerritory(
      board.grid,
      board.p1Cells,
      board.p2Cells,
      target,
    );
    expect(newCells.slice(0, board.p1Cells.length)).toEqual(board.p1Cells);
    expect(gain).toBe(newCells.length - board.p1Cells.length);
    const opponent = new Set(board.p2Cells);
    expect(newCells.some((k) => opponent.has(k))).toBe(false);
    expect(newGrid).not.toBe(board.grid);
  });

  it('detects majority and mutually blocked outcomes', () => {
    expect(checkHiveMultiplayerGameOver(24, 13, 11, 4, 0, 1, [], [], [])).toBe('p1_won');
    expect(checkHiveMultiplayerGameOver(24, 11, 13, 4, 0, 1, [], [], [])).toBe('p2_won');
    expect(checkHiveMultiplayerGameOver(24, 12, 12, 4, 0, 1, [], [], [])).toBe('draw');
  });

  it('uses the one-ply bot heuristic with a legal palette', () => {
    const board = generateTwoPlayerHive(10, 5, mulberry32(99));
    const legal = [0, 1, 2, 3, 4].filter(
      (c) => c !== board.p1Color && c !== board.p2Color,
    );
    const master = bestHiveMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'master',
    );
    expect(legal).toContain(master.bestColor);
    expect(master.maxGain).toBe(
      expandHiveTerritory(board.grid, board.p1Cells, board.p2Cells, master.bestColor)
        .gain,
    );
  });
});
