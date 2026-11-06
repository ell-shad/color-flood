import { z } from 'zod';
import { loadJson, saveJson } from './storage';
import type { GridSize, ColorCount } from '../types';
import { type SoloStars, rateSoloStars } from './soloBalance';

/**
 * P6.1: the Daily Challenge — one deterministic solo board per calendar
 * date, derived entirely from the LOCAL date (everyone's "today" matches
 * their own; streaks are per device).
 *
 * Everything here is pure/date-driven except streak persistence, which
 * rides the versioned storage helper like the other prefs.
 */

/** Anchor for the public puzzle numbering (Day 0 = 2025-01-01). */
const PUZZLE_EPOCH_UTC_MS = Date.UTC(2025, 0, 1); // 2025-01-01

/** Local calendar date as 'YYYY-MM-DD' (stable across the whole day). */
export const dailyDateString = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Integer day index of the local date (UTC-midnight anchored; only
 * differences are ever used, so no timezone drift inside a property). */
export const dailyDateIndex = (dateString: string): number => {
  const [y, m, d] = dateString.split('-').map(Number);
  const localMidnightUtc = Date.UTC(y, m - 1, d);
  return Math.floor((localMidnightUtc - PUZZLE_EPOCH_UTC_MS) / 86_400_000);
};

/** One-based human puzzle number for a date string. */
export const dailyPuzzleNumber = (dateString: string): number => {
  return dailyDateIndex(dateString) + 1;
};

export interface DailyConfig {
  size: GridSize;
  colors: ColorCount;
}

/**
 * Today's board parameters — deterministic per date, rotating through a
 * hand-picked sweeping difficulty arc (all "completable" configs).
 */
const DAILY_CONFIG_CYCLE: DailyConfig[] = [
  { size: 10, colors: 5 },
  { size: 12, colors: 6 },
  { size: 10, colors: 6 },
  { size: 14, colors: 7 },
  { size: 12, colors: 5 },
];

export const dailyConfigForIndex = (index: number): DailyConfig =>
  DAILY_CONFIG_CYCLE[
    ((index % DAILY_CONFIG_CYCLE.length) + DAILY_CONFIG_CYCLE.length) %
      DAILY_CONFIG_CYCLE.length
  ];

/** Board seed for a date index — stable and adequately spread. */
export const dailySeedForIndex = (index: number): number => {
  // Simple mixer so consecutive days don't feel related.
  return ((index + 1) * 2654435761) >>> 0;
};

/** Convenience: config + seed for a date string. */
export const dailySetupFor = (dateString: string): DailyConfig & { seed: number } => {
  const index = dailyDateIndex(dateString);
  return { ...dailyConfigForIndex(index), seed: dailySeedForIndex(index) };
};

// --- Streaks ------------------------------------------------------------------

export interface DailyStreak {
  /** Date of the most recent scored win ('YYYY-MM-DD') or null. */
  lastWinDate: string | null;
  current: number;
  best: number;
}

const EMPTY_STREAK: DailyStreak = { lastWinDate: null, current: 0, best: 0 };

/** 'YYYY-MM-DD' for a date index. */
export const forDateIndex = (index: number): string => {
  const dt = new Date(PUZZLE_EPOCH_UTC_MS + index * 86_400_000);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
};

const DailyStreakSchema = z.object({
  lastWinDate: z.string().nullable(),
  current: z.number().int().min(0).max(99_999),
  best: z.number().int().min(0).max(99_999),
});

export const loadDailyStreak = (): DailyStreak => {
  // No explicit generic here: zod v4's variance quirks make `ZodType<DailyStreak>`
  // fail to accept this schema structurally, but inference (as in useSoloGame's
  // HighScoresSchema) resolves the parsed shape; we normalize fields below.
  const loaded = loadJson('daily-streak', DailyStreakSchema, 'color-flood-daily-streak');
  if (!loaded) return EMPTY_STREAK;
  return {
    lastWinDate: typeof loaded.lastWinDate === 'string' ? loaded.lastWinDate : null,
    current: loaded.current,
    best: loaded.best,
  };
};

/**
 * Applies a win for `dateString` to the streak (pure). The FIRST win per
 * calendar date extends it; repeat wins that day change nothing.
 */
export const applyDailyWin = (streak: DailyStreak, dateString: string): DailyStreak => {
  if (streak.lastWinDate === dateString) return streak; // already counted today
  // Continue the streak only when the previous win was exactly one day ago.
  const gap =
    streak.lastWinDate === null ? 999 : oneDayApart(streak.lastWinDate, dateString);
  const next = gap === 1 ? streak.current + 1 : 1;
  const best = Math.max(streak.best, next);
  return { lastWinDate: dateString, current: next, best };
};

export const saveDailyStreak = (streak: DailyStreak): void => {
  saveJson('daily-streak', streak);
};

/** Gap in days between two 'YYYY-MM-DD' strings (b - a). */
export const oneDayApart = (a: string, b: string): number => {
  const gapMs = dailyDateIndex(b) - dailyDateIndex(a);
  return gapMs;
};

// --- Share sheet --------------------------------------------------------------

/** Palette-agnostic squares for color slots 1..8 (drawn from the shared
 * flood-color ordering, not the active theme, so the emoji are stable). */
const SQUARE_EMOJI = ['🟥', '🟦', '🟩', '🟨', '🟪', '🟧', '🟫', '⬜'];

export interface DailyShareInput {
  dateString: string;
  size: GridSize;
  colors: ColorCount;
  moves: number;
  maxMoves: number;
  /** The played color sequence (1-based palette indices). */
  playedColors: number[];
  status: 'playing' | 'won' | 'lost';
}

/**
 * Wordle-style spoiler-safe share sheet: date + config + result stars +
 * one square per move in the order played. No board layout leaks.
 * `playedColors` holds 0-BASED palette indices (as the solo machine records).
 */
export const buildDailyShareText = (input: DailyShareInput): string => {
  const stars: SoloStars | null =
    input.status === 'won' ? rateSoloStars(input.moves, input.size, input.colors) : null;
  const squares = input.playedColors
    .map((c) => SQUARE_EMOJI[c % SQUARE_EMOJI.length])
    .join('');
  const starRow = stars ? ' ' + '⭐'.repeat(stars) : '';
  const title = `Color Flood Daily #${dailyPuzzleNumber(input.dateString)} · ${input.size}²·${input.colors}`;
  const verdict =
    input.status === 'won'
      ? `Solved in ${input.moves}/${input.maxMoves}${starRow}`
      : input.status === 'lost'
        ? `Out of moves (${input.moves}/${input.maxMoves})`
        : 'In progress';
  return `${title}\n${verdict}\n${squares}`;
};
