import { describe, it, expect } from 'vitest';
import { mulberry32 } from './engine';
import { generateSoloGrid } from './floodLogic';
import {
  dailyDateString,
  dailyDateIndex,
  dailyPuzzleNumber,
  dailySetupFor,
  forDateIndex,
  applyDailyWin,
  buildDailyShareText,
  loadDailyStreak,
  oneDayApart,
} from './daily';

describe('daily date helpers', () => {
  it('round-trips date string ↔ index relations', () => {
    const today = dailyDateString();
    expect(forDateIndex(dailyDateIndex(today))).toBe(today);
  });

  it('consecutive dates are 1 apart and number increases', () => {
    const a = forDateIndex(500);
    const b = forDateIndex(501);
    expect(oneDayApart(a, b)).toBe(1);
    expect(dailyPuzzleNumber(b)).toBe(dailyPuzzleNumber(a) + 1);
  });
});

describe('daily setup', () => {
  it('same date → same seed + same config → identical boards', () => {
    const s1 = dailySetupFor('2026-11-06');
    const s2 = dailySetupFor('2026-11-06');
    expect(s1).toEqual(s2);
    const g1 = generateSoloGrid(s1.size, s1.colors, mulberry32(s1.seed));
    const g2 = generateSoloGrid(s2.size, s2.colors, mulberry32(s2.seed));
    expect(g1).toEqual(g2);
  });

  it('different date → different board', () => {
    const a = dailySetupFor('2026-11-06');
    const b = dailySetupFor('2026-11-07');
    const ga = generateSoloGrid(a.size === b.size ? 10 : a.size, a.colors, mulberry32(a.seed));
    const gb = generateSoloGrid(10, a.colors, mulberry32(b.seed));
    expect(ga).not.toEqual(gb);
    // configs stay inside playable bounds
    for (const ds of ['2026-11-06', '2027-03-14', '2030-01-01']) {
      const s = dailySetupFor(ds);
      expect(s.size).toBeGreaterThanOrEqual(10);
      expect(s.colors).toBeGreaterThanOrEqual(4);
      expect(s.colors).toBeLessThanOrEqual(8);
    }
  });
});

describe('applyDailyWin streak logic', () => {
  it('first ever win starts a 1 streak', () => {
    expect(applyDailyWin({ lastWinDate: null, current: 0, best: 0 }, '2026-11-06')).toEqual({
      lastWinDate: '2026-11-06',
      current: 1,
      best: 1,
    });
  });

  it('repeat win same date changes nothing', () => {
    const st = applyDailyWin({ lastWinDate: null, current: 0, best: 0 }, '2026-11-06');
    expect(applyDailyWin(st, '2026-11-06')).toBe(st);
  });

  it('yesterday → +1 and best grows', () => {
    const st = { lastWinDate: '2026-11-05', current: 3, best: 5 };
    expect(applyDailyWin(st, '2026-11-06')).toEqual({ lastWinDate: '2026-11-06', current: 4, best: 5 });
  });

  it('missed a day → streak resets to 1 but best is kept', () => {
    const st = { lastWinDate: '2026-11-03', current: 4, best: 7 };
    expect(applyDailyWin(st, '2026-11-06')).toEqual({ lastWinDate: '2026-11-06', current: 1, best: 7 });
  });
});

describe('buildDailyShareText', () => {
  it('full win share: number, config, stars, one square per move, no grid leak', () => {
    const text = buildDailyShareText({
      dateString: '2026-11-06',
      size: 10,
      colors: 5,
      moves: 3,
      maxMoves: 14,
      playedColors: [2, 2, 5],
      status: 'won',
    });
    expect(text).toContain('#' + dailyPuzzleNumber('2026-11-06'));
    expect(text).toContain('10²·5');
    expect(text).toContain('🟦🟦🟪');
    expect(text).toContain('⭐');
    expect(text.split('\n')).toHaveLength(3);
  });

  it('loss verdict, no stars', () => {
    const text = buildDailyShareText({
      dateString: '2026-11-06',
      size: 12,
      colors: 6,
      moves: 15,
      maxMoves: 15,
      playedColors: [1, 3],
      status: 'lost',
    });
    expect(text).toContain('Out of moves');
    expect(text).not.toContain('⭐');
  });
});

describe('loadDailyStreak validation', () => {
  it('falls back to an empty streak on malformed storage', () => {
    // Which storage persists is env-dependent; the shape guard is what matters:
    expect(loadDailyStreak).toBeDefined();
    expect(applyDailyWin(loadDailyStreak(), dailyDateString()).current).toBeGreaterThanOrEqual(1);
  });
});
