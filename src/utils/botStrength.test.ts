import { describe, it, expect } from 'vitest';

import {
  bestMultiplayerMoveFlat,
  checkMultiplayerGameOverFlat,
  expandTerritoryFlat,
  generateTwoPlayerGridFlat,
  mulberry32,
  type BotMoveOptions,
} from './engine';
import type { BotDifficulty } from '../types';

/**
 * SEEDED BOT-STRENGTH TESTS (Phase 2 requirement): master must beat medium in at
 * least 70% of full games, and medium must beat easy in at least 70%. Games are
 * full simulations on small boards (keeps the minimax node budget deterministic
 * and the suite fast) with every RNG call derived from a fixed seed, so failures
 * are reproducible.
 */

interface SimResult {
  outcome: 'p1_won' | 'p2_won' | 'draw' | 'timeout';
  moves: number;
}

const simulateGame = (
  size: number,
  colors: number,
  seed: number,
  p1: BotDifficulty,
  p2: BotDifficulty,
  options?: Partial<BotMoveOptions>,
): SimResult => {
  const board0 = generateTwoPlayerGridFlat(size, colors, mulberry32(seed));
  const total = size * size;

  let cells = board0.cells;
  let p1Idx = board0.p1Idx;
  let p2Idx = board0.p2Idx;
  let p1Color = board0.p1Color;
  let p2Color = board0.p2Color;
  let turn: 1 | 2 = 1;
  let moves = 0;

  while (moves < 900) {
    const outcome = checkMultiplayerGameOverFlat(
      total,
      p1Idx.length,
      p2Idx.length,
      colors,
      p1Color,
      p2Color,
      cells,
      size,
      p1Idx,
      p2Idx,
    );
    if (outcome !== 'playing') return { outcome, moves };

    const difficulty = turn === 1 ? p1 : p2;
    // Fresh per-move rng: easy's random pick stays deterministic per position.
    const rng = mulberry32(seed * 7919 + moves * 31 + (turn === 1 ? 1 : 0));

    const { bestColor } = bestMultiplayerMoveFlat(
      cells,
      size,
      turn,
      p1Idx,
      p2Idx,
      p1Color,
      p2Color,
      colors,
      difficulty,
      { ...options, rng },
    );

    const { newGrid, newCells } = expandTerritoryFlat(
      cells,
      size,
      turn === 1 ? p1Idx : p2Idx,
      turn === 1 ? p2Idx : p1Idx,
      bestColor,
    );
    cells = newGrid;
    if (turn === 1) {
      p1Idx = newCells;
      p1Color = bestColor;
      turn = 2;
    } else {
      p2Idx = newCells;
      p2Color = bestColor;
      turn = 1;
    }
    moves++;
  }
  return { outcome: 'timeout', moves };
};

interface MatchupStats {
  wins: number;
  losses: number;
  draws: number;
  timeouts: number;
}

const playMatchup = (
  p1: BotDifficulty,
  p2: BotDifficulty,
  configs: Array<{ size: number; colors: number; seeds: number }>,
  options?: Partial<BotMoveOptions>,
): MatchupStats => {
  const stats: MatchupStats = { wins: 0, losses: 0, draws: 0, timeouts: 0 };
  for (const { size, colors, seeds } of configs) {
    for (let i = 0; i < seeds; i++) {
      const seed = 91_000 + i * 101 + size * 7 + colors;
      const { outcome } = simulateGame(size, colors, seed, p1, p2, options);
      if (outcome === 'p1_won') stats.wins++;
      else if (outcome === 'p2_won') stats.losses++;
      else if (outcome === 'draw') stats.draws++;
      else stats.timeouts++;
    }
  }
  return stats;
};

describe('bot strength ladder (seeded)', () => {
  // Small boards keep minimax searches fast and deterministic.
  const configs = [
    { size: 5, colors: 4, seeds: 10 },
    { size: 7, colors: 4, seeds: 8 },
    { size: 7, colors: 6, seeds: 8 },
  ];

  it('master beats medium in >=70% of games', () => {
    const stats = playMatchup('master', 'medium', configs, { nodeBudget: 200_000 });
    const decided = stats.wins + stats.losses + stats.draws;
    expect(decided, 'no timeouts').toBe(configs.reduce((n, c) => n + c.seeds, 0));
    const rate = stats.wins / decided;
    console.log(
      `master vs medium: ${stats.wins}W ${stats.losses}L ${stats.draws}D -> ${(rate * 100).toFixed(0)}%`,
    );
    expect(rate).toBeGreaterThanOrEqual(0.7);
  }, 300_000);

  it('medium beats easy in >=70% of games', () => {
    const stats = playMatchup('medium', 'easy', configs);
    const decided = stats.wins + stats.losses + stats.draws;
    expect(decided, 'no timeouts').toBe(configs.reduce((n, c) => n + c.seeds, 0));
    const rate = stats.wins / decided;
    console.log(
      `medium vs easy: ${stats.wins}W ${stats.losses}L ${stats.draws}D -> ${(rate * 100).toFixed(0)}%`,
    );
    expect(rate).toBeGreaterThanOrEqual(0.7);
  }, 120_000);
});
