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

// --- Two-player wheel (P9) ---------------------------------------------------
//
// The square battle seeds each player in an opposite corner and lets them flood
// into neutral cells; the polar equivalent seeds them at opposite points of the
// OUTER ring and floods inward/around. Same 4-neighbour rule as solo, but the
// ring wraps, so sector c-1/c+1 are always neighbours.
//
// Cell ownership stays in the shared `"r,c"` string format, so the scoreboard,
// snapshots and protocol need no new encoding — only the topology differs.

const cellKey = (r: number, c: number): string => `${r},${c}`;
const readKey = (k: string): [number, number] => {
  const [r, c] = k.split(',');
  return [Number(r), Number(c)];
};

/** Polar neighbours: both ways around the ring (wrapping), then inward/outward. */
export const wheelNeighbors = (
  r: number,
  c: number,
  rings: number,
  sectors: number,
): Array<[number, number]> => {
  const out: Array<[number, number]> = [
    [r, (c + 1) % sectors],
    [r, (c + sectors - 1) % sectors],
  ];
  if (r + 1 < rings) out.push([r + 1, c]);
  if (r > 0) out.push([r - 1, c]);
  return out;
};

/** Connected same-color component containing (startR, startC), BFS order. */
const wheelComponent = (
  grid: number[][],
  startR: number,
  startC: number,
  color: number,
): string[] => {
  const rings = grid.length;
  const sectors = grid[0].length;
  const seen = new Set<string>([cellKey(startR, startC)]);
  const queue: Array<[number, number]> = [[startR, startC]];
  const out: string[] = [cellKey(startR, startC)];
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [nr, nc] of wheelNeighbors(r, c, rings, sectors)) {
      const k = cellKey(nr, nc);
      if (!seen.has(k) && grid[nr][nc] === color) {
        seen.add(k);
        out.push(k);
        queue.push([nr, nc]);
      }
    }
  }
  return out;
};

export interface TwoPlayerWheelBoard {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

/**
 * Fair two-player wheel: P1 seeds the outer ring at sector 0, P2 at the sector
 * opposite it, with different starting colors and non-overlapping territories.
 * Retries on the rare wrap-around overlap, exactly like the square generator.
 */
export const generateTwoPlayerWheel = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): TwoPlayerWheelBoard => {
  const { rings, sectors } = wheelGeometry(size);
  const p1r = rings - 1;
  const p1c = 0;
  const p2r = rings - 1;
  const p2c = Math.floor(sectors / 2);

  for (let attempt = 0; attempt < 100; attempt++) {
    const grid: number[][] = Array.from({ length: rings }, () =>
      Array.from({ length: sectors }, () => Math.floor(rng() * colorCount)),
    );
    const p1Color = grid[p1r][p1c];
    let p2Color = grid[p2r][p2c];
    if (p2Color === p1Color) {
      p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
      grid[p2r][p2c] = p2Color;
    }
    const p1Cells = wheelComponent(grid, p1r, p1c, p1Color);
    const p2Cells = wheelComponent(grid, p2r, p2c, p2Color);
    const p2Set = new Set(p2Cells);
    if (!p1Cells.some((k) => p2Set.has(k))) {
      return { grid, p1Cells, p2Cells, p1Color, p2Color };
    }
  }

  // Guaranteed-separated fallback: force the two seed cells to distinct colors.
  const grid: number[][] = Array.from({ length: rings }, () =>
    Array.from({ length: sectors }, () => Math.floor(rng() * colorCount)),
  );
  grid[p1r][p1c] = 0;
  grid[p2r][p2c] = 1;
  return {
    grid,
    p1Cells: wheelComponent(grid, p1r, p1c, 0),
    p2Cells: wheelComponent(grid, p2r, p2c, 1),
    p1Color: 0,
    p2Color: 1,
  };
};

/**
 * Territory expansion on the wheel: recolor own cells, then claim reachable
 * neutral cells of `targetColor` (never through an opponent cell). Mirrors
 * `expandPlayerTerritory` on the square board, including insertion order.
 */
export const expandWheelTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
): { newGrid: number[][]; newCells: string[]; gain: number } => {
  const rings = grid.length;
  const sectors = grid[0].length;
  const out = grid.map((row) => [...row]);
  const opponentSet = new Set(opponentCells);
  const owned = new Set<string>();
  const newCells: string[] = [];
  const queue: Array<[number, number]> = [];

  for (const k of currentCells) {
    if (owned.has(k)) continue;
    owned.add(k);
    const [r, c] = readKey(k);
    out[r][c] = targetColor;
    newCells.push(k);
    queue.push([r, c]);
  }

  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [nr, nc] of wheelNeighbors(r, c, rings, sectors)) {
      const k = cellKey(nr, nc);
      if (!owned.has(k) && !opponentSet.has(k) && out[nr][nc] === targetColor) {
        owned.add(k);
        newCells.push(k);
        queue.push([nr, nc]);
      }
    }
  }

  return { newGrid: out, newCells, gain: newCells.length - currentCells.length };
};

/** Terminal check for the wheel — same majority/blocked rules as the square. */
export const checkWheelMultiplayerGameOver = (
  totalCells: number,
  p1Count: number,
  p2Count: number,
  colorCount: number,
  p1Color: number,
  p2Color: number,
  grid: number[][],
  p1Cells: string[],
  p2Cells: string[],
): 'playing' | 'p1_won' | 'p2_won' | 'draw' => {
  const majority = Math.floor(totalCells / 2) + 1;
  if (p1Count >= majority) return 'p1_won';
  if (p2Count >= majority) return 'p2_won';

  if (p1Count + p2Count >= totalCells) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  const legal = (own: number, other: number) => {
    const list: number[] = [];
    for (let i = 0; i < colorCount; i++) if (i !== own && i !== other) list.push(i);
    return list;
  };
  const canGain = (own: string[], other: string[], ownColor: number, otherColor: number) =>
    legal(ownColor, otherColor).some(
      (c) => expandWheelTerritory(grid, own, other, c).gain > 0,
    );

  if (
    !canGain(p1Cells, p2Cells, p1Color, p2Color) &&
    !canGain(p2Cells, p1Cells, p2Color, p1Color)
  ) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  return 'playing';
};

/**
 * Bot / hint choice on the wheel. `master` weighs the move against the best
 * immediate reply (the square master's old one-ply heuristic — a full alpha-beta
 * over an axial board would need a different evaluation), `medium` is greedy and
 * `easy` is mostly random, matching the square ladder's feel.
 */
export const bestWheelMultiplayerMove = (
  grid: number[][],
  activePlayer: 1 | 2,
  p1Cells: string[],
  p2Cells: string[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  difficulty: 'easy' | 'medium' | 'master' = 'master',
  rng: Rng = Math.random,
): { bestColor: number; maxGain: number } => {
  const mine = activePlayer === 1 ? p1Cells : p2Cells;
  const theirs = activePlayer === 1 ? p2Cells : p1Cells;
  const myColor = activePlayer === 1 ? p1Color : p2Color;
  const theirColor = activePlayer === 1 ? p2Color : p1Color;

  const legal: number[] = [];
  for (let i = 0; i < colorCount; i++) {
    if (i !== myColor && i !== theirColor) legal.push(i);
  }
  if (legal.length === 0) return { bestColor: 0, maxGain: 0 };

  const gains = new Map<number, number>();
  for (const c of legal) gains.set(c, expandWheelTerritory(grid, mine, theirs, c).gain);

  if (difficulty === 'easy' && rng() < 0.6) {
    const pick = legal[Math.floor(rng() * legal.length)];
    return { bestColor: pick, maxGain: gains.get(pick) ?? 0 };
  }

  if (difficulty === 'medium') {
    let best = legal[0];
    for (const c of legal) if ((gains.get(c) ?? 0) > (gains.get(best) ?? 0)) best = c;
    return { bestColor: best, maxGain: gains.get(best) ?? 0 };
  }

  let best = legal[0];
  let bestScore = -Infinity;
  for (const c of legal) {
    const { newGrid, newCells } = expandWheelTerritory(grid, mine, theirs, c);
    let reply = 0;
    for (let r = 0; r < colorCount; r++) {
      if (r === c || r === theirColor) continue;
      const g = expandWheelTerritory(newGrid, theirs, newCells, r).gain;
      if (g > reply) reply = g;
    }
    const score = (gains.get(c) ?? 0) * 1.5 - reply * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { bestColor: best, maxGain: gains.get(best) ?? 0 };
};

/** Convenience for seeded reconstruction (share links / replays). */
export const generateSeededWheelBoard = (
  size: number,
  colorCount: number,
  seed: number,
): number[][] => generateWheelBoard(size, colorCount, mulberry32(seed));
