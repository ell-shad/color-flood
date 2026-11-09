import { describe, it, expect } from 'vitest';
import {
  bestTriangleMove,
  bestTriangleMoveWithGain,
  checkTriangleWin,
  countConnectedTriangle,
  floodTriangle,
  generateTriangleBoard,
  getMaxTriangleMoves,
  rateTriangleStars,
  triangleCellCount,
  triangleDistanceField,
  triangleLayoutForSize,
  triangleSeedCell,
} from './triangleEngine';
import { mulberry32 } from './engine';
import { cellCountOf } from './floodLogic';

describe('triangle topology', () => {
  it('maps ladder sizes to a square number of triangular cells', () => {
    const expected = new Map([
      [10, 100],
      [12, 144],
      [14, 196],
      [16, 256],
      [18, 324],
    ]);
    for (const [size, cells] of expected) {
      expect(triangleCellCount(size)).toBe(cells);
      const layout = triangleLayoutForSize(size);
      expect(layout.rows * layout.cols).toBe(cells);
      const board = generateTriangleBoard(size, 4, mulberry32(1));
      expect(board).toHaveLength(layout.rows);
      expect(board.every((row) => row.length === layout.cols)).toBe(true);
      expect(cellCountOf(board)).toBe(cells);
    }
  });

  it('makes every cell a triangle and derives symmetric neighbours', () => {
    for (const size of [10, 18]) {
      const { rows, cols, cells } = triangleLayoutForSize(size);
      expect(cells.length).toBe(rows * cols);
      const byKey = new Map(cells.map((cell, i) => [i, cell]));
      for (let i = 0; i < cells.length; i++) {
        const cell = byKey.get(i)!;
        expect(cell.polygon).toHaveLength(3);
        expect(new Set(cell.neighbours).size).toBe(cell.neighbours.length);
        for (const neighbor of cell.neighbours) {
          expect(byKey.get(neighbor)!.neighbours).toContain(i);
        }
      }
    }
  });

  it('is deterministic and its graph is connected from the bottom-centre triangle', () => {
    expect(triangleLayoutForSize(12)).toEqual(triangleLayoutForSize(12));
    expect(triangleDistanceField(6, 24)).toEqual(triangleDistanceField(6, 24));

    const layout = triangleLayoutForSize(12);
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
    expect(layout.seed).toBe(
      (layout.rows - 1) * layout.cols + Math.floor(layout.cols / 2),
    );
    expect(triangleSeedCell(layout.rows, layout.cols)).toEqual([
      layout.rows - 1,
      Math.floor(layout.cols / 2),
    ]);
  });

  it('floods across the triangle edges it draws', () => {
    const board = generateTriangleBoard(10, 4, mulberry32(11));
    const layout = triangleLayoutForSize(10);
    const [sr, sc] = triangleSeedCell(layout.rows, layout.cols);
    const seedColor = board[sr][sc];
    const flooded = floodTriangle(board, (seedColor + 1) % 4);
    expect(board[sr][sc]).toBe(seedColor);
    expect(flooded[sr][sc]).toBe((seedColor + 1) % 4);
    expect(countConnectedTriangle(flooded)).toBeGreaterThan(
      countConnectedTriangle(board),
    );
  });

  it('detects wins and chooses a greedy hint with positive gain', () => {
    const board = generateTriangleBoard(10, 4, mulberry32(3));
    const hint = bestTriangleMoveWithGain(board, 4);
    expect(hint).not.toBeNull();
    expect(bestTriangleMove(board, 4)).toBe(hint!.color);
    const after = floodTriangle(board, hint!.color);
    expect(countConnectedTriangle(after)).toBeGreaterThan(countConnectedTriangle(board));
    const won = Array.from({ length: 5 }, () => Array.from({ length: 20 }, () => 1));
    expect(checkTriangleWin(won)).toBe(true);
    expect(bestTriangleMove(won, 4)).toBeNull();
  });

  it('exposes a positive calibrated budget and star rating', () => {
    for (const size of [10, 12, 14, 16, 18]) {
      for (const colors of [4, 5, 6, 7, 8]) {
        expect(getMaxTriangleMoves(size, colors)).toBeGreaterThan(0);
      }
    }
    expect(rateTriangleStars(1, 10, 4)).toBe(3);
  });
});
