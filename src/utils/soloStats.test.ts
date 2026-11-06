import { describe, it, expect } from 'vitest';
import {
  EMPTY_SOLO_STATS,
  updateSoloStats,
  statsStarsFor,
  winRatePercent,
  avgMovesFor,
} from './soloStats';
import { rateSoloStars } from './soloBalance';
import { rateWheelStars } from './circleEngine';

describe('updateSoloStats', () => {
  it('records a first win: totals, streak, config entry with best', () => {
    const next = updateSoloStats(EMPTY_SOLO_STATS, {
      size: 10,
      colors: 4,
      moves: 12,
      won: true,
    });
    expect(next.total).toEqual({ games: 1, wins: 1 });
    expect(next.winStreak).toEqual({ current: 1, best: 1 });
    expect(next.byConfig).toHaveLength(1);
    expect(next.byConfig[0]).toEqual({
      // P7.3: omitted shape defaults to the classic square.
      shape: 'classic',
      size: 10,
      colors: 4,
      games: 1,
      wins: 1,
      sumMoves: 12,
      bestMoves: 12,
    });
  });

  it('a loss resets the streak but keeps best, adds game + avg material', () => {
    const base = updateSoloStats(EMPTY_SOLO_STATS, {
      size: 10,
      colors: 4,
      moves: 12,
      won: true,
    });
    const after = updateSoloStats(base, { size: 10, colors: 4, moves: 20, won: false });
    expect(after.total).toEqual({ games: 2, wins: 1 });
    expect(after.winStreak).toEqual({ current: 0, best: 1 });
    expect(after.byConfig[0].games).toBe(2);
    expect(after.byConfig[0].bestMoves).toBe(12);
    expect(avgMovesFor(after.byConfig[0])).toBe(16);
  });

  it('streak best survives a loss and outgrows current', () => {
    let s = EMPTY_SOLO_STATS;
    for (let i = 0; i < 3; i++)
      s = updateSoloStats(s, { size: 12, colors: 6, moves: 10, won: true });
    expect(s.winStreak).toEqual({ current: 3, best: 3 });
    s = updateSoloStats(s, { size: 12, colors: 6, moves: 15, won: false });
    expect(s.winStreak).toEqual({ current: 0, best: 3 });
    s = updateSoloStats(s, { size: 12, colors: 6, moves: 11, won: true });
    expect(s.winStreak).toEqual({ current: 1, best: 3 });
  });

  it('merges same config entries and sorts by size then colors', () => {
    let s = updateSoloStats(EMPTY_SOLO_STATS, {
      size: 12,
      colors: 6,
      moves: 14,
      won: true,
    });
    s = updateSoloStats(s, { size: 10, colors: 5, moves: 9, won: true });
    s = updateSoloStats(s, { size: 12, colors: 6, moves: 12, won: true });
    expect(s.byConfig.map((c) => `${c.size}·${c.colors}`)).toEqual(['10·5', '12·6']);
    expect(s.byConfig[1]).toMatchObject({
      games: 2,
      wins: 2,
      sumMoves: 26,
      bestMoves: 12,
    });
  });

  it('keeps wheel and classic records apart and rates wheels on their own par', () => {
    let s = updateSoloStats(EMPTY_SOLO_STATS, {
      shape: 'classic',
      size: 10,
      colors: 4,
      moves: 12,
      won: true,
    });
    s = updateSoloStats(s, {
      shape: 'wheel',
      size: 10,
      colors: 4,
      moves: 12,
      won: true,
    });
    // Same size/colors, different topology ⇒ two rows (classic sorts first).
    expect(s.byConfig).toHaveLength(2);
    expect(s.byConfig.map((c) => c.shape)).toEqual(['classic', 'wheel']);
    expect(s.byConfig[0].games).toBe(1);
    expect(s.byConfig[1].games).toBe(1);
    // Stars come from the matching par table.
    expect(statsStarsFor(s.byConfig[0])).toBe(rateSoloStars(12, 10, 4));
    expect(statsStarsFor(s.byConfig[1])).toBe(rateWheelStars(12, 10, 4));
    // The wheel par is tighter, so the same 12 moves must not earn more stars.
    expect(rateWheelStars(12, 10, 4)).toBeLessThanOrEqual(rateSoloStars(12, 10, 4));
  });

  it('star rating is derived from the best win', () => {
    const s = updateSoloStats(EMPTY_SOLO_STATS, {
      size: 10,
      colors: 5,
      moves: 9,
      won: true,
    });
    expect(statsStarsFor(s.byConfig[0])).not.toBeNull();
    expect(statsStarsFor({ ...s.byConfig[0], bestMoves: null })).toBeNull();
  });

  it('win rate guard: 0 games → 0%', () => {
    expect(winRatePercent(0, 0)).toBe(0);
    expect(winRatePercent(3, 4)).toBe(75);
  });
});
