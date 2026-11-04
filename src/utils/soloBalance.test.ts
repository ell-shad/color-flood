import { describe, it, expect } from 'vitest';

import {
  maxSoloMovesLimit,
  soloPar,
  rateSoloStars,
  PAR_MOVES,
  SOLO_LIMITS,
} from './soloBalance';
import { GRID_SIZES, COLOR_COUNTS } from './floodLogic';

describe('solo balance table', () => {
  it('covers every supported config', () => {
    for (const size of GRID_SIZES) {
      for (const colors of COLOR_COUNTS) {
        expect(PAR_MOVES.has(`${size}:${colors}`), `par ${size}:${colors}`).toBe(true);
        expect(SOLO_LIMITS.has(`${size}:${colors}`), `limit ${size}:${colors}`).toBe(
          true,
        );
      }
    }
    expect(PAR_MOVES.size).toBe(GRID_SIZES.length * COLOR_COUNTS.length);
    expect(SOLO_LIMITS.size).toBe(GRID_SIZES.length * COLOR_COUNTS.length);
  });

  it('keeps limits non-trivial: par + 2 <= limit <= par + 8', () => {
    for (const size of GRID_SIZES) {
      for (const colors of COLOR_COUNTS) {
        const par = soloPar(size, colors);
        const limit = maxSoloMovesLimit(size, colors);
        expect(limit, `${size}:${colors}`).toBeGreaterThanOrEqual(par + 2);
        expect(limit, `${size}:${colors}`).toBeLessThanOrEqual(par + 8);
      }
    }
  });

  it('fixes the loose easy configs (regression: 10x10/4c used to be 23)', () => {
    // The prompt flagged 10x10/4c as far too loose (limit 23, greedy avg 13).
    expect(maxSoloMovesLimit(10, 4)).toBeLessThanOrEqual(15);
    expect(maxSoloMovesLimit(12, 4)).toBeLessThanOrEqual(18);
    // Easy configs must not be given more room than the old flat formula allowed.
    for (const colors of COLOR_COUNTS) {
      const size = 10;
      expect(maxSoloMovesLimit(size, colors)).toBeLessThanOrEqual(
        Math.floor(size * 1.5 + colors * 2),
      );
    }
  });

  it('stars: <=par is 3, midpoint is 2, within limit is 1', () => {
    const par = soloPar(18, 8);
    const limit = maxSoloMovesLimit(18, 8);
    expect(rateSoloStars(par, 18, 8)).toBe(3);
    expect(rateSoloStars(par + 1, 18, 8)).toBe(2);
    const midpoint = par + Math.ceil((limit - par) / 2);
    expect(rateSoloStars(midpoint, 18, 8)).toBe(2);
    expect(rateSoloStars(limit, 18, 8)).toBe(1);
  });

  it('falls back to the legacy formula for configs outside the table', () => {
    // 20 is not a supported grid size but the function must not throw.
    expect(maxSoloMovesLimit(20, 4)).toBe(Math.floor(20 * 1.5 + 4 * 2));
  });
});
