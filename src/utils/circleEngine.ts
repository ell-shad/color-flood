import type { GridSize } from '../types';
import { mulberry32, type Rng } from './engine';
import { getMaxSoloMoves } from './floodLogic';

/**
 * P7.1 — Circle (wheel) boards for solo play.
 *
 * The wheel is stored as `grid[rings][sectors]`:
 * - row 0 is the INNERMOST ring (the seed ring, claimed from the start),
 * - sector index grows clockwise and WRAPS (ring adjacency is a cycle),
 * - a cell's neighbors are its two sector-neighbours (same ring) and the
 *   cells directly inward/outward at the same sector.
 *
 * Keeping the wheel in the same number[rings][sectors] shape as a square board
 * lets the solo reducer's repaint-diff history (P5.6), playing colors, share
 * seeds and undo work unchanged; only flood/win/count/hint dispatch by shape.
 *
 * The classic square kernels in `engine.ts` stay untouched (they are guarded
 * by the legacy parity suite); these kernels are small and wheels are ≤ 264
 * cells, so clarity wins over micro-optimisation here.
 */

export interface WheelGeometry {
  rings: number;
  sectors: number;
}

/**
 * Difficulty mapping "derived from the size choice" (P7 decision): bigger
 * ladder step ⇒ more rings AND more sectors. Both grow monotonically; sector
 * counts stay even so the wheel keeps a mirror-symmetric look.
 */
export const WHEEL_GEOMETRY: Record<GridSize, WheelGeometry> = {
  10: { rings: 7, sectors: 16 },
  12: { rings: 8, sectors: 18 },
  14: { rings: 9, sectors: 20 },
  16: { rings: 10, sectors: 22 },
  18: { rings: 11, sectors: 24 },
};

export const wheelGeometry = (size: number): WheelGeometry =>
  WHEEL_GEOMETRY[size as GridSize] ?? WHEEL_GEOMETRY[10];

export const wheelCellCount = (size: number): number => {
  const { rings, sectors } = wheelGeometry(size);
  return rings * sectors;
};

/**
 * Move budget. Calibrated against the square ladder (P7.1 sim): the wheel's
 * uniform seed ring is structurally much stronger than the square's corner
 * seed (a competent hint-quality solver needs ~half the moves), so the
 * budget is 0.7× the same-size square budget. Greedy simulations (500 seeds
 * per config) win within the budget in 96.8–100% per config — worst at the
 * hardest 18×8 — with avg-need/budget ratios (~0.42–0.88) tracking the
 * square ladder's own 0.42–0.87 solver feel.
 */
export const getMaxWheelMoves = (size: number, colorCount: number): number =>
  Math.round(getMaxSoloMoves(size, colorCount) * 0.7);

/**
 * Seeded wheel generation (P6.3 convention: every board carries its seed).
 * The inner ring is uniformly the seed color — that uniform ring IS the
 * starting territory, matching the reference "center → outward" design.
 */
export const generateWheelBoard = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): number[][] => {
  const { rings, sectors } = wheelGeometry(size);
  const seedColor = Math.floor(rng() * colorCount);
  const grid: number[][] = Array.from({ length: rings }, () =>
    Array.from({ length: sectors }, () => Math.floor(rng() * colorCount)),
  );
  grid[0] = Array.from({ length: sectors }, () => seedColor);
  return grid;
};

export const floodWheel = (grid: number[][], targetColor: number): number[][] => {
  const out = grid.map((row) => [...row]);
  const rings = out.length;
  const sectors = out[0].length;
  const startColor = out[0][0];
  if (startColor === targetColor) return out;

  const visited = Array.from({ length: rings }, () => new Uint8Array(sectors));
  const queue: Array<[number, number]> = [];
  // The whole seed ring is one connected territory.
  for (let s = 0; s < sectors; s++) {
    if (out[0][s] === startColor) {
      visited[0][s] = 1;
      queue.push([0, s]);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    out[r][c] = targetColor;
    // Sector neighbours (wrap) + inner/outer ring neighbours.
    for (const [nr, nc] of [
      [r, (c + 1) % sectors],
      [r, (c + sectors - 1) % sectors],
      ...(r + 1 < rings ? [[r + 1, c]] : []),
      ...(r > 0 ? [[r - 1, c]] : []),
    ]) {
      if (!visited[nr][nc] && grid[nr][nc] === startColor) {
        visited[nr][nc] = 1;
        queue.push([nr, nc]);
      }
    }
  }
  return out;
};

export const checkWheelWin = (grid: number[][]): boolean => {
  const color = grid[0][0];
  return grid.every((row) => row.every((cell) => cell === color));
};

/** Size of the connected same-color region containing the seed ring. */
export const countConnectedWheel = (grid: number[][]): number => {
  const rings = grid.length;
  const sectors = grid[0].length;
  const startColor = grid[0][0];
  const visited = Array.from({ length: rings }, () => new Uint8Array(sectors));
  const queue: Array<[number, number]> = [];
  for (let s = 0; s < sectors; s++) {
    if (grid[0][s] === startColor) {
      visited[0][s] = 1;
      queue.push([0, s]);
    }
  }
  let head = 0;
  let count = queue.length;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [nr, nc] of [
      [r, (c + 1) % sectors],
      [r, (c + sectors - 1) % sectors],
      ...(r + 1 < rings ? [[r + 1, c]] : []),
      ...(r > 0 ? [[r - 1, c]] : []),
    ]) {
      if (!visited[nr][nc] && grid[nr][nc] === startColor) {
        visited[nr][nc] = 1;
        count++;
        queue.push([nr, nc]);
      }
    }
  }
  return count;
};

/**
 * Greedy hint (mirrors the square hint's "play like the smart chip" role):
 * pick the color whose immediate flood claims the most new cells; break ties
 * toward the smaller palette index. Returns null when the board is already
 * won (any further "hint" would be pointless).
 */
export const bestWheelMove = (grid: number[][], colorCount: number): number | null => {
  if (checkWheelWin(grid)) return null;
  const seedColor = grid[0][0];
  const before = countConnectedWheel(grid);
  let bestColor: number | null = null;
  let bestGain = 0;
  for (let c = 0; c < colorCount; c++) {
    if (c === seedColor) continue;
    const sized = floodWheel(grid, c);
    const gain = countConnectedWheel(sized) - before;
    if (gain > bestGain) {
      bestGain = gain;
      bestColor = c;
    }
  }
  return bestColor;
};

/** Convenience for seeded reconstruction (share links / replays). */
export const generateSeededWheelBoard = (
  size: number,
  colorCount: number,
  seed: number,
): number[][] => generateWheelBoard(size, colorCount, mulberry32(seed));
