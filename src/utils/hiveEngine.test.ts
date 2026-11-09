import { describe, it, expect } from 'vitest';
import {
  bestHiveMove,
  bestHiveMoveWithGain,
  checkHiveWin,
  countConnectedHive,
  floodHive,
  generateHiveBoard,
  getMaxHiveMoves,
  hiveCellCount,
  hiveDistanceField,
  hiveLayoutForSize,
  hiveSeedCell,
  rateHiveStars,
} from './hiveEngine';
import { mulberry32 } from './engine';
import { cellCountOf } from './floodLogic';

describe('hexagon-hive topology', () => {
  it('maps ladder sizes to rows and columns of hexagonal cells', () => {
    const expected = new Map([
      [10, 90],
      [12, 120],
      [14, 168],
      [16, 224],
      [18, 288],
    ]);
    for (const [size, cells] of expected) {
      expect(hiveCellCount(size)).toBe(cells);
      const layout = hiveLayoutForSize(size);
      expect(layout.rows * layout.cols).toBe(cells);
      const board = generateHiveBoard(size, 4, mulberry32(1));
      expect(board).toHaveLength(layout.rows);
      expect(board.every((row) => row.length === layout.cols)).toBe(true);
      expect(cellCountOf(board)).toBe(cells);
    }
  });

  it('makes every interior cell a hexagon and derives symmetric neighbours', () => {
    for (const size of [10, 18]) {
      const { cells } = hiveLayoutForSize(size);
      for (const cell of cells) {
        expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
        expect(new Set(cell.neighbours).size).toBe(cell.neighbours.length);
        for (const neighbor of cell.neighbours) {
          expect(cells[neighbor].neighbours).toContain(cells.indexOf(cell));
        }
      }
      // A truly interior hexagon must have all six walls.
      const interior = cells.filter((cell) => cell.neighbours.length === 6);
      expect(interior.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic and its honeycomb graph is connected', () => {
    expect(hiveLayoutForSize(12)).toEqual(hiveLayoutForSize(12));
    expect(hiveDistanceField(12, 10)).toEqual(hiveDistanceField(12, 10));

    const layout = hiveLayoutForSize(12);
    const seen = new Set([layout.seed]);
    const queue = [layout.seed];
    while (queue.length) {
      const index = queue.pop()!;
      for (const next of layout.cells[index].neighbours) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(layout.cells.length);
    const [r, c] = hiveSeedCell(layout.rows, layout.cols);
    expect(layout.seed).toBe(r * layout.cols + c);
    expect(r).toBe(layout.rows - 1);
  });

  it('floods across honeycomb walls', () => {
    const board = generateHiveBoard(10, 4, mulberry32(11));
    const layout = hiveLayoutForSize(10);
    const [sr, sc] = hiveSeedCell(layout.rows, layout.cols);
    const seedColor = board[sr][sc];
    const flooded = floodHive(board, (seedColor + 1) % 4);
    expect(board[sr][sc]).toBe(seedColor);
    expect(flooded[sr][sc]).toBe((seedColor + 1) % 4);
    expect(countConnectedHive(flooded)).toBeGreaterThan(countConnectedHive(board));
  });

  it('detects wins and chooses a greedy hint with positive gain', () => {
    const board = generateHiveBoard(10, 4, mulberry32(3));
    const hint = bestHiveMoveWithGain(board, 4);
    expect(hint).not.toBeNull();
    expect(bestHiveMove(board, 4)).toBe(hint!.color);
    const after = floodHive(board, hint!.color);
    expect(countConnectedHive(after)).toBeGreaterThan(countConnectedHive(board));
    const won = Array.from({ length: 10 }, () => Array.from({ length: 9 }, () => 1));
    expect(checkHiveWin(won)).toBe(true);
    expect(bestHiveMove(won, 4)).toBeNull();
  });

  it('exposes a positive calibrated budget and star rating', () => {
    for (const size of [10, 12, 14, 16, 18]) {
      for (const colors of [4, 5, 6, 7, 8]) {
        expect(getMaxHiveMoves(size, colors)).toBeGreaterThan(0);
      }
    }
    expect(rateHiveStars(1, 10, 4)).toBe(3);
  });
});
