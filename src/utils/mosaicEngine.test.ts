import { describe, it, expect } from 'vitest';
import {
  bestMosaicMove,
  bestMosaicMoveWithGain,
  checkMosaicWin,
  countConnectedMosaic,
  floodMosaic,
  generateMosaicBoard,
  getMaxMosaicMoves,
  mosaicCellCount,
  mosaicDistanceField,
  mosaicLayout,
  mosaicSeedCell,
  mosaicSide,
  rateMosaicStars,
} from './mosaicEngine';
import { mulberry32 } from './engine';
import { cellCountOf } from './floodLogic';

describe('mosaic topology', () => {
  it('maps the ladder directly to cells per row and gives a square board', () => {
    const expected = new Map([
      [10, 10],
      [12, 12],
      [14, 14],
      [16, 16],
      [18, 18],
    ]);
    for (const [size, side] of expected) {
      expect(mosaicSide(size)).toBe(side);
      expect(mosaicCellCount(size)).toBe(side * side);
      const board = generateMosaicBoard(size, 4, mulberry32(1));
      expect(board).toHaveLength(side);
      expect(board.every((row) => row.length === side)).toBe(true);
      expect(cellCountOf(board)).toBe(side * side);
    }
  });

  it('builds a convex Voronoi tiling whose polygons cover the square', () => {
    for (const side of [10, 18]) {
      const layout = mosaicLayout(side);
      expect(layout.side).toBe(side);
      expect(layout.cells).toHaveLength(side * side);
      let totalArea = 0;
      for (const cell of layout.cells) {
        expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
        let area = 0;
        for (let i = 0; i < cell.polygon.length; i++) {
          const [x1, y1] = cell.polygon[i];
          const [x2, y2] = cell.polygon[(i + 1) % cell.polygon.length];
          area += x1 * y2 - x2 * y1;
        }
        area /= 2;
        expect(area).toBeGreaterThan(0);
        totalArea += area;
        expect(cell.site[0]).toBeGreaterThanOrEqual(0);
        expect(cell.site[0]).toBeLessThanOrEqual(1);
        expect(cell.site[1]).toBeGreaterThanOrEqual(0);
        expect(cell.site[1]).toBeLessThanOrEqual(1);
      }
      expect(totalArea).toBeCloseTo(1, 8);
    }
  });

  it('derives symmetric neighbors and a connected adjacency graph', () => {
    for (const side of [10, 18]) {
      const { cells, seed } = mosaicLayout(side);
      for (let i = 0; i < cells.length; i++) {
        expect(new Set(cells[i].neighbours).size).toBe(cells[i].neighbours.length);
        for (const neighbor of cells[i].neighbours) {
          expect(cells[neighbor].neighbours).toContain(i);
        }
      }
      const seen = new Set([seed]);
      const queue = [seed];
      while (queue.length) {
        const index = queue.pop()!;
        for (const neighbor of cells[index].neighbours) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      expect(seen.size).toBe(cells.length);
    }
  });

  it('is deterministic for the same board size', () => {
    expect(mosaicLayout(12)).toEqual(mosaicLayout(12));
    expect(mosaicDistanceField(12)).toEqual(mosaicDistanceField(12));
  });

  it('seeds the flood from the bottom-centre cell', () => {
    for (const side of [10, 12, 18]) {
      const { cells, seed } = mosaicLayout(side);
      const [r, c] = mosaicSeedCell(side);
      expect(seed).toBe(r * side + c);
      const scores = cells.map(({ site }) => (1 - site[1]) * 2 + Math.abs(site[0] - 0.5));
      expect(scores[seed]).toBe(Math.min(...scores));
      expect(r).toBe(side - 1);
    }
  });
});

describe('mosaic solo play', () => {
  it('reproduces seeded boards and never starts won', () => {
    const a = generateMosaicBoard(12, 5, mulberry32(777));
    const b = generateMosaicBoard(12, 5, mulberry32(777));
    expect(a).toEqual(b);
    expect(checkMosaicWin(a)).toBe(false);
  });

  it('floods exactly the seed connected component and leaves the input intact', () => {
    const board = generateMosaicBoard(10, 4, mulberry32(11));
    const side = 10;
    const [sr, sc] = mosaicSeedCell(side);
    const seedColor = board[sr][sc];
    const flooded = floodMosaic(board, (seedColor + 1) % 4);
    expect(board[sr][sc]).toBe(seedColor);
    expect(flooded[sr][sc]).toBe((seedColor + 1) % 4);
    expect(countConnectedMosaic(flooded)).toBeGreaterThan(countConnectedMosaic(board));
  });

  it('floods a hand-built component across a polygon edge', () => {
    const side = 10;
    const layout = mosaicLayout(side);
    const [sr, sc] = mosaicSeedCell(side);
    const seedIndex = sr * side + sc;
    const board = Array.from({ length: side }, () =>
      Array.from({ length: side }, () => 2),
    );
    board[sr][sc] = 1;
    const neighborIndex = layout.cells[seedIndex].neighbours[0];
    const nr = Math.floor(neighborIndex / side);
    const nc = neighborIndex % side;
    board[nr][nc] = 1;
    const flooded = floodMosaic(board, 3);
    expect(flooded[sr][sc]).toBe(3);
    expect(flooded[nr][nc]).toBe(3);
    expect(countConnectedMosaic(flooded)).toBeGreaterThanOrEqual(2);
  });

  it('detects wins and chooses a greedy hint with positive gain', () => {
    const board = generateMosaicBoard(10, 4, mulberry32(3));
    const hint = bestMosaicMoveWithGain(board, 4);
    expect(hint).not.toBeNull();
    expect(bestMosaicMove(board, 4)).toBe(hint!.color);
    const after = floodMosaic(board, hint!.color);
    expect(countConnectedMosaic(after)).toBeGreaterThan(countConnectedMosaic(board));
    const won = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 1));
    expect(checkMosaicWin(won)).toBe(true);
    expect(bestMosaicMove(won, 4)).toBeNull();
  });

  it('exposes a positive calibrated budget and star rating', () => {
    for (const size of [10, 12, 14, 16, 18]) {
      for (const colors of [4, 5, 6, 7, 8]) {
        expect(getMaxMosaicMoves(size, colors)).toBeGreaterThan(0);
      }
    }
    expect(rateMosaicStars(1, 10, 4)).toBe(3);
  });
});
