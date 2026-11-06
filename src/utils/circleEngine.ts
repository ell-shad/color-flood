import type { GridSize } from '../types';
import { mulberry32, type Rng } from './engine';
import {
  maxSoloMovesLimit,
  rateSoloStarsWith,
  soloPar,
  type SoloStars,
} from './soloBalance';

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
 * Move budget. Calibrated against the REAL solo limit table (P7.1 sim, 500
 * seeds per config): the wheel's uniform seed ring is structurally much
 * stronger than the square's corner seed — the greedy needs ~60% of the
 * square's solver-calibrated SOLO_LIMITS — so a competent hint player gets
 * budgets at 0.9× the same-size solo limit (96.8–100% win per config,
 * avg-need/budget ~0.58–0.76, in family with the square ladder's feel).
 * Stars follow the square's rates: par thresholds at 0.85× (the wheel hint
 * has no beam lookahead, so its median stays below the scaled par).
 */
export const WHEEL_LIMIT_FACTOR = 0.9;
export const WHEEL_PAR_FACTOR = 0.85;

export const getMaxWheelMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * WHEEL_LIMIT_FACTOR);

/** 3-star move threshold for wheel boards (mirrors `soloPar`). */
export const getWheelPar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * WHEEL_PAR_FACTOR);

/** Shape-correct star rating for wheel boards (mirrors `rateSoloStars`). */
export const rateWheelStars = (moves: number, size: number, colors: number): SoloStars =>
  rateSoloStarsWith(moves, getWheelPar(size, colors), getMaxWheelMoves(size, colors));

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
export const bestWheelMove = (grid: number[][], colorCount: number): number | null =>
  bestWheelMoveWithGain(grid, colorCount)?.color ?? null;

/**
 * P7.3: hint + its immediate cell gain (the palette chip's `(+n)` badge the
 * square hint has always shown). Kept separate from the square helper because
 * wheels count their claim through `countConnectedWheel`.
 */
export const bestWheelMoveWithGain = (
  grid: number[][],
  colorCount: number,
): { color: number; gain: number } | null => {
  if (checkWheelWin(grid)) return null;
  const seedColor = grid[0][0];
  const before = countConnectedWheel(grid);
  let best: { color: number; gain: number } | null = null;
  for (let c = 0; c < colorCount; c++) {
    if (c === seedColor) continue;
    const gain = countConnectedWheel(floodWheel(grid, c)) - before;
    // Ties keep the earlier (smaller) palette index — same as bestWheelMove.
    if (gain > 0 && (best === null || gain > best.gain)) best = { color: c, gain };
  }
  return best;
};

/** Convenience for seeded reconstruction (share links / replays). */
export const generateSeededWheelBoard = (
  size: number,
  colorCount: number,
  seed: number,
): number[][] => generateWheelBoard(size, colorCount, mulberry32(seed));
