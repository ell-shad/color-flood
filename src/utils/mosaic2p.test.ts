import { describe, it, expect } from 'vitest';
import {
  bestMosaicMultiplayerMove,
  checkMosaicMultiplayerGameOver,
  expandMosaicTerritory,
  generateTwoPlayerMosaic,
  mosaicSeedCell,
  mosaicTopSeedCell,
} from './mosaicEngine';
import { mulberry32 } from './engine';

describe('two-player mosaic (P14 multiplayer)', () => {
  it('seeds P1 at the bottom centre and P2 at the top centre', () => {
    for (const size of [10, 12, 18]) {
      for (let seed = 0; seed < 5; seed++) {
        const board = generateTwoPlayerMosaic(
          size,
          4,
          mulberry32(seed * 31 + size),
          seed * 977,
        );
        expect(board.p1Color).not.toBe(board.p2Color);
        const side = board.grid.length;
        expect(board.p1Cells[0]).toBe(mosaicSeedCell(side, seed * 977).join(','));
        expect(board.p2Cells[0]).toBe(mosaicTopSeedCell(side, seed * 977).join(','));
        const p2Set = new Set(board.p2Cells);
        expect(board.p1Cells.some((k) => p2Set.has(k))).toBe(false);
      }
    }
  });

  it('expands territory on the visible graph and never eats opponent land', () => {
    const board = generateTwoPlayerMosaic(10, 5, mulberry32(42), 7);
    const target = [0, 1, 2, 3, 4].find(
      (c) => c !== board.p1Color && c !== board.p2Color,
    )!;
    const { newGrid, newCells, gain } = expandMosaicTerritory(
      board.grid,
      board.p1Cells,
      board.p2Cells,
      target,
      7,
    );
    expect(newCells.slice(0, board.p1Cells.length)).toEqual(board.p1Cells);
    expect(gain).toBe(newCells.length - board.p1Cells.length);
    const opponent = new Set(board.p2Cells);
    expect(newCells.some((k) => opponent.has(k))).toBe(false);
    expect(newGrid).not.toBe(board.grid);
  });

  it('detects majority and mutually blocked outcomes', () => {
    expect(checkMosaicMultiplayerGameOver(24, 13, 11, 4, 0, 1, [], [], [], 3)).toBe(
      'p1_won',
    );
    expect(checkMosaicMultiplayerGameOver(24, 11, 13, 4, 0, 1, [], [], [], 3)).toBe(
      'p2_won',
    );
    expect(checkMosaicMultiplayerGameOver(24, 12, 12, 4, 0, 1, [], [], [], 3)).toBe(
      'draw',
    );
  });

  it('uses the one-ply bot heuristic with a legal palette', () => {
    const board = generateTwoPlayerMosaic(10, 5, mulberry32(99), 5);
    const legal = [0, 1, 2, 3, 4].filter(
      (c) => c !== board.p1Color && c !== board.p2Color,
    );
    const medium = bestMosaicMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'medium',
      undefined,
      5,
    );
    expect(legal).toContain(medium.bestColor);
    expect(medium.maxGain).toBe(
      expandMosaicTerritory(board.grid, board.p1Cells, board.p2Cells, medium.bestColor, 5)
        .gain,
    );
    const master = bestMosaicMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'master',
      undefined,
      5,
    );
    expect(legal).toContain(master.bestColor);
  });
});
