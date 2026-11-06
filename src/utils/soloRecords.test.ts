import { describe, it, expect } from 'vitest';
import { upsertHighScore } from '../hooks/useSoloGame';
import type { HighScore } from '../types';

/**
 * P7.3: high scores are keyed by TOPOLOGY + config. Wheels have their own
 * (tighter) par table, so a wheel best must never overwrite a square best.
 */

describe('upsertHighScore', () => {
  it('keeps classic and wheel records for the same config apart', () => {
    const base: HighScore[] = [{ shape: 'classic', size: 10, colors: 4, moves: 12 }];
    const withWheel = upsertHighScore(base, 'wheel', 10, 4, 15);
    expect(withWheel).toHaveLength(2);
    expect(withWheel[1]).toEqual({ shape: 'wheel', size: 10, colors: 4, moves: 15 });

    const improved = upsertHighScore(withWheel, 'wheel', 10, 4, 11);
    expect(improved.find((s) => s.shape === 'wheel')?.moves).toBe(11);
    expect(improved.find((s) => s.shape === 'classic')?.moves).toBe(12);
  });

  it('returns the same array for equal or worse scores', () => {
    const base: HighScore[] = [{ shape: 'classic', size: 12, colors: 5, moves: 10 }];
    expect(upsertHighScore(base, 'classic', 12, 5, 10)).toBe(base);
    expect(upsertHighScore(base, 'classic', 12, 5, 14)).toBe(base);
  });

  it('starts a new row for a fresh config', () => {
    const next = upsertHighScore([], 'wheel', 18, 8, 30);
    expect(next).toEqual([{ shape: 'wheel', size: 18, colors: 8, moves: 30 }]);
  });
});
