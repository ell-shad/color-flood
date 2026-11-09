import { z } from 'zod';
import { loadJson, saveJson } from './storage';
import type { BoardShape } from '../types';
import { assertNever, parseBoardShape } from './boardShape';
import { type SoloStars, rateSoloStars } from './soloBalance';
import { rateCubeStars } from './cubeEngine';
import { rateWheelStars } from './circleEngine';
import { rateMosaicStars } from './mosaicEngine';

/**
 * P6.2: per-device solo statistics, persisted alongside the other versioned
 * prefs. Only *completed* games (won or lost) are recorded — boards dumped
 * mid-game via "New Game" never skew the averages.
 *
 * Daily-challenge rounds are recorded with their actual round config, so a
 * 12²·5 daily pollutes nothing: it is a legitimate game of 12²·5.
 */

export interface SoloConfigStats {
  /** P7.3: topology the row belongs to — wheel records rate on wheel par. */
  shape: BoardShape;
  size: number;
  colors: number;
  games: number;
  wins: number;
  /** Sum of final move counts (wins and losses) for the average. */
  sumMoves: number;
  /** Fewest moves that won this config (null until the first win). */
  bestMoves: number | null;
}

export interface SoloStats {
  total: { games: number; wins: number };
  /** Consecutive solo wins across all configs. */
  winStreak: { current: number; best: number };
  byConfig: SoloConfigStats[];
}

export const EMPTY_SOLO_STATS: SoloStats = {
  total: { games: 0, wins: 0 },
  winStreak: { current: 0, best: 0 },
  byConfig: [],
};

const ConfigStatsSchema = z.object({
  // P7.3/P11: rows recorded before shapes existed are classic squares.
  shape: z.enum(['classic', 'wheel', 'cube', 'mosaic']).optional(),
  size: z.number().int().min(4).max(32),
  colors: z.number().int().min(2).max(12),
  games: z.number().int().min(0).max(9_999),
  wins: z.number().int().min(0).max(9_999),
  sumMoves: z.number().int().min(0).max(99_999),
  bestMoves: z.number().int().min(1).max(9_999).nullable(),
});

const SoloStatsSchema = z.object({
  total: z.object({
    games: z.number().int().min(0).max(99_999),
    wins: z.number().int().min(0).max(99_999),
  }),
  winStreak: z.object({
    current: z.number().int().min(0).max(9_999),
    best: z.number().int().min(0).max(9_999),
  }),
  // 25 configs × 3 topologies, plus headroom.
  byConfig: z.array(ConfigStatsSchema).max(90),
});

export const loadSoloStats = (): SoloStats => {
  // No explicit generic: zod v4 variance quirks make `ZodType<SoloStats>` reject
  // this schema; inference + explicit normalization (see daily.ts) is exact.
  const loaded = loadJson('solo-stats', SoloStatsSchema, 'color-flood-solo-stats');
  if (!loaded) return EMPTY_SOLO_STATS;
  return {
    total: { games: loaded.total.games, wins: loaded.total.wins },
    winStreak: { current: loaded.winStreak.current, best: loaded.winStreak.best },
    byConfig: loaded.byConfig.map((c) => ({
      shape: parseBoardShape(c.shape),
      size: c.size,
      colors: c.colors,
      games: c.games,
      wins: c.wins,
      sumMoves: c.sumMoves,
      bestMoves: typeof c.bestMoves === 'number' ? c.bestMoves : null,
    })),
  };
};

export const saveSoloStats = (stats: SoloStats): void => {
  saveJson('solo-stats', stats);
};

export interface SoloGameEnd {
  /** P7.3: topology; omitted ⇒ classic (legacy callers/tests). */
  shape?: BoardShape;
  size: number;
  colors: number;
  moves: number;
  won: boolean;
}

/** Pure reducer for one finished game (the config entry is merged lazily). */
export const updateSoloStats = (stats: SoloStats, game: SoloGameEnd): SoloStats => {
  const shape: BoardShape = game.shape ?? 'classic';
  const byConfig = stats.byConfig.map((c) => ({ ...c }));
  let entry = byConfig.find(
    (c) => c.shape === shape && c.size === game.size && c.colors === game.colors,
  );
  if (!entry) {
    entry = {
      shape,
      size: game.size,
      colors: game.colors,
      games: 0,
      wins: 0,
      sumMoves: 0,
      bestMoves: null,
    };
    byConfig.push(entry);
  }
  entry.games += 1;
  entry.sumMoves += game.moves;
  if (game.won) {
    entry.wins += 1;
    entry.bestMoves =
      entry.bestMoves === null ? game.moves : Math.min(entry.bestMoves, game.moves);
  }
  byConfig.sort(
    (a, b) => a.shape.localeCompare(b.shape) || a.size - b.size || a.colors - b.colors,
  );

  const total = {
    games: stats.total.games + 1,
    wins: stats.total.wins + (game.won ? 1 : 0),
  };
  const winStreak = {
    current: game.won ? stats.winStreak.current + 1 : 0,
    best: game.won
      ? Math.max(stats.winStreak.best, stats.winStreak.current + 1)
      : stats.winStreak.best,
  };
  return { total, winStreak, byConfig };
};

/** Stars earned for a config's record win (null until any win exists). */
export const statsStarsFor = (entry: SoloConfigStats): SoloStars | null => {
  if (entry.bestMoves === null) return null;
  switch (entry.shape) {
    case 'wheel':
      return rateWheelStars(entry.bestMoves, entry.size, entry.colors);
    case 'cube':
      return rateCubeStars(entry.bestMoves, entry.size, entry.colors);
    case 'mosaic':
      return rateMosaicStars(entry.bestMoves, entry.size, entry.colors);
    case 'classic':
      return rateSoloStars(entry.bestMoves, entry.size, entry.colors);
    default:
      return assertNever(entry.shape);
  }
};

/** Win rate as a whole percent (0–100), guarded against divide-by-zero. */
export const winRatePercent = (wins: number, games: number): number =>
  games === 0 ? 0 : Math.round((wins / games) * 100);

/** Mean moves per completed game, one decimal (NaN-safe). */
export const avgMovesFor = (entry: SoloConfigStats): number | null =>
  entry.games === 0 ? null : Math.round((entry.sumMoves / entry.games) * 10) / 10;
