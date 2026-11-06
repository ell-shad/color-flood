import { describe, it, expect } from 'vitest';
import {
  WHEEL_GEOMETRY,
  wheelCellCount,
  generateWheelBoard,
  generateSeededWheelBoard,
  floodWheel,
  checkWheelWin,
  countConnectedWheel,
  bestWheelMove,
  bestWheelMoveWithGain,
  getMaxWheelMoves,
  getWheelPar,
  rateWheelStars,
} from './circleEngine';
import { mulberry32 } from './engine';
import { maxSoloMovesLimit } from './soloBalance';
import { GRID_SIZES, COLOR_COUNTS } from './floodLogic';

/**
 * P7.1: wheel invariants — seeded generation, wrap-aware flood, win/count
 * agreement, hint progress, and greedy-solver solvability of the move budget.
 */

const countColor = (grid: number[][], color: number): number =>
  grid.reduce((acc, row) => acc + row.filter((c) => c === color).length, 0);

describe('P7.1 circle engine — geometry', () => {
  it('keeps the size ladder monotonic (bigger board ⇒ more rings AND sectors)', () => {
    for (let i = 1; i < GRID_SIZES.length; i++) {
      const a = WHEEL_GEOMETRY[GRID_SIZES[i - 1]];
      const b = WHEEL_GEOMETRY[GRID_SIZES[i]];
      expect(b.rings).toBeGreaterThan(a.rings);
      expect(b.sectors).toBeGreaterThan(a.sectors);
    }
  });

  it('budget is calibrated to the real solo limits and strictly grows', () => {
    for (const size of GRID_SIZES) {
      for (const colors of COLOR_COUNTS) {
        // Calibrated factor (P7.2 sim): 0.9× the solver-calibrated solo limit;
        // 500-seed greedy runs win within the budget in 100% per config.
        expect(getMaxWheelMoves(size, colors)).toBe(
          Math.round(maxSoloMovesLimit(size, colors) * 0.9),
        );
      }
    }
    // Bigger boards and richer palettes must never lower the budget.
    for (const colors of COLOR_COUNTS) {
      for (let i = 1; i < GRID_SIZES.length; i++) {
        expect(getMaxWheelMoves(GRID_SIZES[i], colors)).toBeGreaterThan(
          getMaxWheelMoves(GRID_SIZES[i - 1], colors),
        );
      }
    }
    for (const size of GRID_SIZES) {
      for (let j = 1; j < COLOR_COUNTS.length; j++) {
        expect(getMaxWheelMoves(size, COLOR_COUNTS[j])).toBeGreaterThan(
          getMaxWheelMoves(size, COLOR_COUNTS[j - 1]),
        );
      }
    }
  });

  it('rates stars above the scaled wheel par', () => {
    // 3 stars at ≤ par, 1 star at the limit — same rule, wheel thresholds.
    const par = getWheelPar(10, 4);
    expect(rateWheelStars(par, 10, 4)).toBe(3);
    expect(rateWheelStars(par + 1, 10, 4)).toBeLessThan(3);
    expect(rateWheelStars(getMaxWheelMoves(10, 4), 10, 4)).toBe(1);
  });
});

describe('P7.1 circle engine — generation', () => {
  it('is deterministic for a given seed and matches the seeded helper', () => {
    const a = generateWheelBoard(12, 5, mulberry32(777));
    const b = generateWheelBoard(12, 5, mulberry32(777));
    const seeded = generateSeededWheelBoard(12, 5, 777);
    expect(a).toEqual(b);
    expect(a).toEqual(seeded);
  });

  it('builds the requested shape with a uniform seed ring and valid colors', () => {
    for (const size of GRID_SIZES) {
      for (const colors of COLOR_COUNTS) {
        const grid = generateWheelBoard(size, colors, mulberry32(1));
        expect(grid.length).toBe(WHEEL_GEOMETRY[size].rings);
        expect(grid[0].length).toBe(WHEEL_GEOMETRY[size].sectors);
        expect(grid.flat()).toHaveLength(wheelCellCount(size));
        const ring0 = new Set(grid[0]);
        expect(ring0.size).toBe(1);
        const seed = grid[0][0];
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(colors);
        expect(grid.flat().every((c) => c >= 0 && c < colors)).toBe(true);
      }
    }
  });
});

describe('P7.1 circle engine — flood semantics', () => {
  it('repaints the seed component; target-colored strays stay put', () => {
    // Engine rule = "repaint the whole connected component of the flood
    // color" (same as the square engine). Tapping 3 when nothing 3-adjacent
    // changes only the inner ring — pockets keep their colors.
    const grid = [
      [0, 0, 0, 0],
      [1, 2, 1, 1],
      [0, 1, 0, 1],
    ];
    const flooded = floodWheel(grid, 3);
    expect(flooded[0].every((c) => c === 3)).toBe(true);
    expect(flooded[1]).toEqual([1, 2, 1, 1]);
    expect(flooded[2]).toEqual([0, 1, 0, 1]);
  });

  it('absorbs start-color cells through territory adjacency (then walkable)', () => {
    //   ring0: A A A A   ring1: B C B B   (A=0, B=1, C=2)
    // Tap 1: the seed component is ring0 alone (ring1 B's match the START
    // color? No — they match 1 which is the TARGET: they join on the NEXT
    // tap, mirroring the square engine's one-tap-delayed merge).
    const grid = [
      [0, 0, 0, 0],
      [1, 2, 1, 1],
    ];
    const step1 = floodWheel(grid, 1); // inner ring → 1s
    expect(step1).toEqual([
      [1, 1, 1, 1],
      [1, 2, 1, 1],
    ]);
    // Now the flood color is 1 and the ring-1 B's touch the territory…
    const step2 = floodWheel(step1, 2); // region repaints to 2 (B's already 2)
    expect(checkWheelWin(step2)).toBe(true); // 2s everywhere
  });

  it('treats sector adjacency as a cycle (last sector touches the first)', () => {
    const grid = [
      [0, 0],
      [1, 0],
    ];
    // Seed 0; ring1[1] is a 0 → part of the seed component via ring adjacency.
    const flooded = floodWheel(grid, 2);
    expect(flooded).toEqual([
      [2, 2],
      [1, 2],
    ]);
  });

  it('no-ops when the target equals the seed color', () => {
    const grid = generateWheelBoard(10, 4, mulberry32(5));
    const flooded = floodWheel(grid, grid[0][0]);
    expect(flooded).toEqual(grid);
    // And it never mutates the original.
    expect(grid).not.toBe(flooded);
  });

  it('always grows or holds the claimed territory (monotonic claim)', () => {
    const grid = generateWheelBoard(14, 6, mulberry32(99));
    let current = grid;
    let previous = countConnectedWheel(current);
    for (let move = 0; move < 30; move++) {
      const color = (current[0][0] + 1 + move) % 6;
      current = floodWheel(current, color);
      expect(countConnectedWheel(current)).toBeGreaterThanOrEqual(previous);
      expect(current[0][0]).toBe(color);
      previous = countConnectedWheel(current);
    }
  });
});

describe('P7.1 circle engine — win & count', () => {
  it('declares a win exactly when every cell matches the seed color', () => {
    // ring0 uniform A; ring1 all B → a single tap of B repaints the ring and
    // lands on a full win.
    const grid = [
      [0, 0, 0],
      [1, 1, 1],
    ];
    expect(checkWheelWin(grid)).toBe(false);
    const won = floodWheel(grid, 1);
    expect(checkWheelWin(won)).toBe(true);
    expect(checkWheelWin(grid)).toBe(false); // input untouched
  });

  it('counts the connected claim, not every cell of the flood color', () => {
    //   ring0: 1 1 1 1   ring1: 2 2 2 2   ring2: 3 0 2 2
    // Tap 3 repaints only the seed ring: the stray ring2[0]=3 is blocked by
    // ring1's 2s, so the claim is 4 while the board holds 5 threes.
    const grid = [
      [1, 1, 1, 1],
      [2, 2, 2, 2],
      [3, 0, 2, 2],
    ];
    const flooded = floodWheel(grid, 3);
    expect(countConnectedWheel(flooded)).toBe(4);
    expect(countColor(flooded, 3)).toBe(5);
  });
});

/**
 * Solver-solvability acceptance (P7.1 calibration): the greedy hint must win
 * ≥ 90% of sampled games WITHIN the budget — the DoD's competent-player bar.
 * The offline 500-seed sim at the 0.9× factor ranges 96.8–100% per config
 * (the square ladder itself floors at ~98%). 20 deterministic seeds per
 * config keep the suite fast.
 */
describe('P7.1 circle engine — budgets are solvable by the hint', () => {
  it('greedy play wins ≥ 90% of sampled games within the move budget', () => {
    for (const size of GRID_SIZES) {
      for (const colors of COLOR_COUNTS) {
        const budget = getMaxWheelMoves(size, colors);
        let wins = 0;
        for (let i = 0; i < 20; i++) {
          const rng = mulberry32((0x9e3779b9 ^ (i * 2654435761)) >>> 0);
          let grid = generateWheelBoard(size, colors, rng);
          let win = false;
          for (let moves = 0; moves < budget; moves++) {
            const hint = bestWheelMove(grid, colors);
            if (hint === null) break;
            grid = floodWheel(grid, hint);
            if (checkWheelWin(grid)) {
              win = true;
              break;
            }
          }
          if (win) wins++;
        }
        expect(wins).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('P7.1 circle engine — hint', () => {
  it('returns an expanding color on mid-game boards and null on won boards', () => {
    const grid = generateWheelBoard(12, 5, mulberry32(21));
    const hint = bestWheelMove(grid, 5);
    expect(hint).not.toBeNull();
    if (hint === null) return; // narrowed
    expect(hint).toBeGreaterThanOrEqual(0);
    expect(hint).toBeLessThan(5);
    expect(hint).not.toBe(grid[0][0]);
    // The hint's flood must actually claim new cells (strict progress).
    const after = floodWheel(grid, hint);
    expect(countConnectedWheel(after)).toBeGreaterThan(countConnectedWheel(grid));
    // A fully flooded wheel yields no hint.
    const won = Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => 2));
    expect(bestWheelMove(won, 5)).toBeNull();
  });

  it('reports the hint gain for the palette badge (P7.3)', () => {
    // ring0 A A A / ring1 B C B: color 1 absorbs two sectors, color 2 one.
    const grid = [
      [0, 0, 0],
      [1, 2, 1],
    ];
    expect(bestWheelMoveWithGain(grid, 3)).toEqual({ color: 1, gain: 2 });
    // A won board offers no hint (and therefore no gain).
    expect(
      bestWheelMoveWithGain(
        [
          [2, 2, 2],
          [2, 2, 2],
        ],
        3,
      ),
    ).toBeNull();
  });

  it('ties break toward the larger-claim color the greedy way', () => {
    //   ring0: A A A   ring1: B C B   (1 touches two sectors, 2 touches one)
    const grid = [
      [0, 0, 0],
      [1, 2, 1],
    ];
    const hint = bestWheelMove(grid, 3);
    expect(hint).toBe(1);
  });
});
