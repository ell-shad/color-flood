import type { GridSize } from '../types';
import { mulberry32, type Rng } from './engine';
import {
  maxSoloMovesLimit,
  rateSoloStarsWith,
  soloPar,
  type SoloStars,
} from './soloBalance';

/**
 * P13 — Mosaic boards (irregular polygonal tiling).
 *
 * A mosaic is a Voronoi diagram of jittered lattice points inside the unit
 * square: every cell is a convex polygon, every polygon comes from its own
 * site, and the union is exactly the square (no overlapping or missing area by
 * construction). That is what makes it a *board* rather than decoration: two
 * cells are neighbours exactly when a bisector actually cut one of them, so
 * the flood walks the polygon edges the player can see.
 *
 * Storage keeps the game-wide `number[side][side]` shape and the `"r,c"` cell
 * key: cell `k` is `grid[floor(k / side)][k % side]` in lattice (row-major)
 * order. Solo reducer, undo diffs, share links, records and replay therefore
 * need no new encoding — only flood/win/count/hint dispatch by shape.
 *
 * The polygon layout is derived from the side and a 32-bit layout seed, so the
 * same board can be regenerated anywhere — engine, board, tests, server,
 * replay — with no extra geometry state beyond that seed.
 *
 * The same graph also powers two-player mosaic: P1 starts at the bottom-centre
 * shard, P2 at the opposite top-centre shard, and each turn expands the active
 * player's territory across shared polygon edges.
 */

export type Point = [number, number];

export interface MosaicCell {
  /** Site (cell centre in the unit square), in lattice order. */
  site: Point;
  /** Convex polygon of the cell in the unit square. */
  polygon: Point[];
  /** Adjacent cell indices (share a polygon edge). */
  neighbours: number[];
}

export interface MosaicLayout {
  side: number;
  cells: MosaicCell[];
  /** Index of the cell nearest the bottom centre. */
  seed: number;
}

const EPS = 1e-9;
/** Jitter as a fraction of a lattice step; < 0.5 keeps the lattice order. */
const SITE_JITTER = 0.48;
/** Disabled: Lloyd relaxation evens cell sizes, but the mosaic should stay irregular. */
const RELAX_STEPS = 0;

const squarePolygon = (): Point[] => [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const polygonArea = (poly: Point[]): number => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
};

const polygonCentroid = (poly: Point[]): Point => {
  const area = polygonArea(poly);
  if (Math.abs(area) < EPS) {
    // Degenerate (should not happen for a real cell): fall back to the mean.
    const sum = poly.reduce<Point>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [sum[0] / poly.length, sum[1] / poly.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (6 * area), cy / (6 * area)];
};

/**
 * Sutherland–Hodgman clip of `poly` to the half-plane of points closer to
 * `own` than to `other`: `(p − midpoint) · (other − own) ≤ 0`.
 */
const clipToBisector = (poly: Point[], own: Point, other: Point): Point[] => {
  const dx = other[0] - own[0];
  const dy = other[1] - own[1];
  const mx = (own[0] + other[0]) / 2;
  const my = (own[1] + other[1]) / 2;
  const side = (p: Point) => dx * (p[0] - mx) + dy * (p[1] - my);

  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    const sCurrent = side(current);
    const sNext = side(next);
    const insideCurrent = sCurrent <= EPS;
    const insideNext = sNext <= EPS;
    if (insideCurrent) out.push(current);
    if (insideCurrent !== insideNext) {
      const t = sCurrent / (sCurrent - sNext);
      out.push([
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]);
    }
  }
  return out;
};

/**
 * Voronoi cells of `sites`, clipped to the unit square.
 *
 * A cell is the intersection of its own half-planes with every other site, so
 * clip ORDER does not matter for the polygon. Adjacency is therefore derived
 * afterwards from the finished polygons: two cells are neighbours iff one of
 * a cell's edges lies on their shared bisector (both endpoints on it). That
 * test is order-independent — measuring "did this clip remove area" during
 * the loop wrongly reports every far site that happened to cut the square
 * before the near sites had narrowed it down.
 */
const polyMaxDistSq = (poly: Point[], own: Point): number => {
  let maxR2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const dx = poly[i][0] - own[0];
    const dy = poly[i][1] - own[1];
    const r2 = dx * dx + dy * dy;
    if (r2 > maxR2) maxR2 = r2;
  }
  return maxR2;
};

const diagramOf = (
  sites: Point[],
  side: number,
): { polygons: Point[][]; neighbours: number[][] } => {
  const n = sites.length;
  const polygons: Point[][] = new Array(n);
  const maxR2List = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const own = sites[i];
    const r = Math.floor(i / side);
    const c = i % side;
    let poly = squarePolygon();

    // 1. Clip nearby 5x5 lattice window first so the polygon radius shrinks quickly.
    const rMin = Math.max(0, r - 2);
    const rMax = Math.min(side - 1, r + 2);
    const cMin = Math.max(0, c - 2);
    const cMax = Math.min(side - 1, c + 2);
    for (let rr = rMin; rr <= rMax && poly.length >= 3; rr++) {
      for (let cc = cMin; cc <= cMax && poly.length >= 3; cc++) {
        const j = rr * side + cc;
        if (j === i) continue;
        poly = clipToBisector(poly, own, sites[j]);
      }
    }

    // 2. Prune distant sites via Cauchy-Schwarz: if d^2 > 4 * maxR^2, no point in
    //    `poly` can be closer to `other` than `own`, nor lie on the bisector.
    let maxR2 = polyMaxDistSq(poly, own);
    for (let j = 0; j < n && poly.length >= 3; j++) {
      const jr = Math.floor(j / side);
      const jc = j % side;
      if (Math.abs(jr - r) <= 2 && Math.abs(jc - c) <= 2) continue;
      const other = sites[j];
      const dx = other[0] - own[0];
      const dy = other[1] - own[1];
      const d2 = dx * dx + dy * dy;
      if (d2 > 4 * maxR2 + 1e-4) continue;
      poly = clipToBisector(poly, own, other);
      maxR2 = polyMaxDistSq(poly, own);
    }

    const finished = poly.length >= 3 ? poly : squarePolygon();
    polygons[i] = finished;
    maxR2List[i] = polyMaxDistSq(finished, own);
  }

  const neighbours: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const poly = polygons[i];
    const own = sites[i];
    const maxR2 = maxR2List[i];
    const adj: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const other = sites[j];
      const dx = other[0] - own[0];
      const dy = other[1] - own[1];
      const d2 = dx * dx + dy * dy;
      if (d2 > 4 * maxR2 + 1e-4) continue;
      const mx = (own[0] + other[0]) / 2;
      const my = (own[1] + other[1]) / 2;
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        if (ex * ex + ey * ey <= 1e-12) continue;
        if (
          Math.abs(dx * (a[0] - mx) + dy * (a[1] - my)) < 1e-9 &&
          Math.abs(dx * (b[0] - mx) + dy * (b[1] - my)) < 1e-9
        ) {
          adj.push(j);
          break;
        }
      }
    }
    neighbours[i] = adj;
  }

  return { polygons, neighbours };
};

const buildLayout = (side: number, layoutSeed: number): MosaicLayout => {
  const rng = mulberry32((0x5eed1a3 ^ layoutSeed ^ (side * 2654435761)) >>> 0);
  let sites: Point[] = [];
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      // Jittered lattice: enough irregularity for a mosaic, no slivers.
      sites.push([
        (c + 0.5 + (rng() - 0.5) * SITE_JITTER) / side,
        (r + 0.5 + (rng() - 0.5) * SITE_JITTER) / side,
      ]);
    }
  }

  let polygons: Point[][] = [];
  let neighbours: number[][] = [];
  for (let step = 0; step <= RELAX_STEPS; step++) {
    const diagram = diagramOf(sites, side);
    polygons = diagram.polygons;
    neighbours = diagram.neighbours;
    if (step === RELAX_STEPS) break;
    sites = polygons.map((poly, i) =>
      poly.length >= 3 ? polygonCentroid(poly) : sites[i],
    );
  }

  const cells: MosaicCell[] = sites.map((site, i) => ({
    site,
    polygon: polygons[i],
    neighbours: neighbours[i],
  }));

  let seed = 0;
  let seedScore = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i].site;
    // Bottom-centre origin: the closest site to the bottom edge, then centre-x.
    const score = (1 - y) * 2 + Math.abs(x - 0.5);
    if (score < seedScore) {
      seedScore = score;
      seed = i;
    }
  }

  return { side, cells, seed };
};

const MAX_MOSAIC_CACHE = 32;
const layoutCache = new Map<string, MosaicLayout>();

/** Layout for a board side and seed; generated once and cached. */
export const mosaicLayout = (side: number, layoutSeed: number = 0): MosaicLayout => {
  const key = `${Math.max(2, Math.floor(side))}:${layoutSeed >>> 0}`;
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = buildLayout(Math.max(2, Math.floor(side)), layoutSeed >>> 0);
    if (layoutCache.size >= MAX_MOSAIC_CACHE) {
      const oldest = layoutCache.keys().next().value;
      if (oldest !== undefined) layoutCache.delete(oldest);
    }
    layoutCache.set(key, layout);
  }
  return layout;
};

/** A ladder size maps straight onto cells per row (10 → 100 cells … 18 → 324). */
export const mosaicSide = (size: number): number => {
  const ladder: Record<GridSize, number> = { 10: 10, 12: 12, 14: 14, 16: 16, 18: 18 };
  return ladder[size as GridSize] ?? 10;
};

export const mosaicCellCount = (size: number): number => mosaicSide(size) ** 2;

/** Lattice index ↔ stored `grid[r][c]` (row-major). */
const rowOf = (index: number, side: number): number => Math.floor(index / side);
const colOf = (index: number, side: number): number => index % side;

/** The solo flood origin: the bottom-centre cell. */
export const mosaicSeedCell = (
  side: number,
  layoutSeed: number = 0,
): [number, number] => {
  const { seed } = mosaicLayout(side, layoutSeed);
  return [rowOf(seed, side), colOf(seed, side)];
};

/**
 * Seeded board generation: colours are uniform random, and the seed cell keeps
 * its own colour (the flood starts there, exactly like the cube's face centre).
 */
export const generateMosaicBoard = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
  layoutSeed: number = 0,
): number[][] => {
  const side = mosaicSide(size);
  const grid: number[][] = Array.from({ length: side }, () =>
    Array.from({ length: side }, () => Math.floor(rng() * colorCount)),
  );
  // A monochrome board would be won before the first move.
  const [sr, sc] = mosaicSeedCell(side, layoutSeed);
  const seedColor = grid[sr][sc];
  if (grid.every((row) => row.every((cell) => cell === seedColor))) {
    grid[(sr + 1) % side][(sc + 1) % side] = (seedColor + 1) % colorCount;
  }
  return grid;
};

/** Cell indices of the connected region of `color` containing the origin. */
const originRegion = (
  grid: number[][],
  color: number,
  layoutSeed: number = 0,
): number[] => {
  const side = grid.length;
  const { cells, seed } = mosaicLayout(side, layoutSeed);
  const seen = new Uint8Array(cells.length);
  const queue: number[] = [seed];
  seen[seed] = 1;
  const out: number[] = [seed];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      if (!seen[next] && grid[rowOf(next, side)][colOf(next, side)] === color) {
        seen[next] = 1;
        out.push(next);
        queue.push(next);
      }
    }
  }
  return out;
};

/** Graph distance (cells) from the seed cell — the flood's wave stagger. */
const distanceCache = new Map<string, Int16Array>();

export const mosaicDistanceField = (side: number, layoutSeed: number = 0): Int16Array => {
  const key = `${side}:${layoutSeed >>> 0}`;
  const cached = distanceCache.get(key);
  if (cached) return cached;
  const { cells, seed } = mosaicLayout(side, layoutSeed);
  const distances = new Int16Array(cells.length).fill(-1);
  distances[seed] = 0;
  const queue: number[] = [seed];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      if (distances[next] === -1) {
        distances[next] = distances[index] + 1;
        queue.push(next);
      }
    }
  }
  if (distanceCache.size >= MAX_MOSAIC_CACHE) {
    const oldest = distanceCache.keys().next().value;
    if (oldest !== undefined) distanceCache.delete(oldest);
  }
  distanceCache.set(key, distances);
  return distances;
};

export const floodMosaic = (
  grid: number[][],
  targetColor: number,
  layoutSeed: number = 0,
): number[][] => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side, layoutSeed);
  const startColor = grid[sr][sc];
  if (startColor === targetColor) return grid;
  const out = grid.map((row) => [...row]);
  for (const index of originRegion(grid, startColor, layoutSeed)) {
    out[rowOf(index, side)][colOf(index, side)] = targetColor;
  }
  return out;
};

export const checkMosaicWin = (grid: number[][], layoutSeed: number = 0): boolean => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side, layoutSeed);
  const color = grid[sr][sc];
  return grid.every((row) => row.every((cell) => cell === color));
};

export const countConnectedMosaic = (
  grid: number[][],
  layoutSeed: number = 0,
): number => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side, layoutSeed);
  return originRegion(grid, grid[sr][sc], layoutSeed).length;
};

/**
 * Greedy hint (same role as the square/wheel chip): the colour whose immediate
 * flood claims the most cells, ties to the lower palette index.
 */
export const bestMosaicMoveWithGain = (
  grid: number[][],
  colorCount: number,
  layoutSeed: number = 0,
): { color: number; gain: number } | null => {
  if (checkMosaicWin(grid, layoutSeed)) return null;
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side, layoutSeed);
  const seedColor = grid[sr][sc];
  const before = countConnectedMosaic(grid, layoutSeed);
  let best: { color: number; gain: number } | null = null;
  for (let color = 0; color < colorCount; color++) {
    if (color === seedColor) continue;
    const gain =
      countConnectedMosaic(floodMosaic(grid, color, layoutSeed), layoutSeed) - before;
    if (gain > 0 && (best === null || gain > best.gain)) best = { color, gain };
  }
  return best;
};

export const bestMosaicMove = (
  grid: number[][],
  colorCount: number,
  layoutSeed: number = 0,
): number | null => bestMosaicMoveWithGain(grid, colorCount, layoutSeed)?.color ?? null;

/**
 * Move budget and stars.
 *
 * The bottom-centre origin needs more room than the earlier centre origin, so
 * this factor is measured after that change against the greedy solver in
 * `scripts/mosaicSim.ts` (500 seeds/config). The bottom-origin run gives
 * 99.4–100% greedy wins at 0.95× with a 0.63–0.75 average-need/budget band;
 * par sits at 0.85× of the same limit.
 */
export const MOSAIC_LIMIT_FACTOR = 0.95;
export const MOSAIC_PAR_FACTOR = 0.85;

export const getMaxMosaicMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * MOSAIC_LIMIT_FACTOR);

export const getMosaicPar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * MOSAIC_PAR_FACTOR);

export const rateMosaicStars = (moves: number, size: number, colors: number): SoloStars =>
  rateSoloStarsWith(moves, getMosaicPar(size, colors), getMaxMosaicMoves(size, colors));

// --- Two-player mosaic --------------------------------------------------------

/** P14: opposite (top-centre) seed used for multiplayer. */
export const mosaicTopSeedCell = (
  side: number,
  layoutSeed: number = 0,
): [number, number] => {
  const { cells } = mosaicLayout(side, layoutSeed);
  let seed = 0;
  let seedScore = Infinity;
  cells.forEach((cell, index) => {
    const [x, y] = cell.site;
    const score = y * 2 + Math.abs(x - 0.5);
    if (score < seedScore) {
      seedScore = score;
      seed = index;
    }
  });
  return [rowOf(seed, side), colOf(seed, side)];
};

export interface TwoPlayerMosaicBoard {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

const indexToKey = (index: number, cols: number): string =>
  `${rowOf(index, cols)},${colOf(index, cols)}`;
const keyToIndex = (key: string, cols: number): number => {
  const [r, c] = key.split(',').map(Number);
  return r * cols + c;
};

const componentFrom = (
  grid: number[][],
  start: number,
  color: number,
  side: number,
  layoutSeed: number,
): string[] => {
  const { cells } = mosaicLayout(side, layoutSeed);
  const seen = new Uint8Array(cells.length);
  const queue: number[] = [start];
  seen[start] = 1;
  const out: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      if (!seen[next] && grid[rowOf(next, side)][colOf(next, side)] === color) {
        seen[next] = 1;
        out.push(next);
        queue.push(next);
      }
    }
  }
  return out.map((index) => indexToKey(index, side));
};

/**
 * Two-player mosaic: P1 starts at the bottom-centre seed and P2 at the
 * top-centre seed, with the same component rule as the solo flood.
 */
export const generateTwoPlayerMosaic = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
  layoutSeed: number = 0,
): TwoPlayerMosaicBoard => {
  const side = mosaicSide(size);
  const layout = mosaicLayout(side, layoutSeed);
  const grid: number[][] = Array.from({ length: side }, () =>
    Array.from({ length: side }, () => Math.floor(rng() * colorCount)),
  );
  const p1Index = layout.seed;
  const [p2r, p2c] = mosaicTopSeedCell(side, layoutSeed);
  const p2Index = p2r * side + p2c;
  const p1Color = grid[rowOf(p1Index, side)][colOf(p1Index, side)];
  const p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
  grid[p2r][p2c] = p2Color;
  return {
    grid,
    p1Cells: componentFrom(grid, p1Index, p1Color, side, layoutSeed),
    p2Cells: componentFrom(grid, p2Index, p2Color, side, layoutSeed),
    p1Color,
    p2Color,
  };
};

/** Territory expansion on the visible mosaic graph. */
export const expandMosaicTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
  layoutSeed: number = 0,
): { newGrid: number[][]; newCells: string[]; gain: number } => {
  const side = grid.length;
  const { cells } = mosaicLayout(side, layoutSeed);
  const out = grid.map((row) => [...row]);
  const opponentSet = new Set(opponentCells);
  const owned = new Set<string>();
  const newCells: string[] = [];
  const queue: number[] = [];

  for (const key of currentCells) {
    if (owned.has(key)) continue;
    owned.add(key);
    const [r, c] = key.split(',').map(Number);
    out[r][c] = targetColor;
    newCells.push(key);
    queue.push(keyToIndex(key, side));
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      const key = indexToKey(next, side);
      if (
        !owned.has(key) &&
        !opponentSet.has(key) &&
        out[rowOf(next, side)][colOf(next, side)] === targetColor
      ) {
        owned.add(key);
        newCells.push(key);
        queue.push(next);
      }
    }
  }

  return { newGrid: out, newCells, gain: newCells.length - currentCells.length };
};

export const checkMosaicMultiplayerGameOver = (
  totalCells: number,
  p1Count: number,
  p2Count: number,
  colorCount: number,
  p1Color: number,
  p2Color: number,
  grid: number[][],
  p1Cells: string[],
  p2Cells: string[],
  layoutSeed: number = 0,
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
  const canGain = (
    own: string[],
    other: string[],
    ownColor: number,
    otherColor: number,
  ) =>
    legal(ownColor, otherColor).some(
      (c) => expandMosaicTerritory(grid, own, other, c, layoutSeed).gain > 0,
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

/** Same one-ply easy/medium/master heuristic as wheel and hive. */
export const bestMosaicMultiplayerMove = (
  grid: number[][],
  activePlayer: 1 | 2,
  p1Cells: string[],
  p2Cells: string[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  difficulty: 'easy' | 'medium' | 'master' = 'master',
  rng: Rng = Math.random,
  layoutSeed: number = 0,
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
  for (const c of legal) {
    gains.set(c, expandMosaicTerritory(grid, mine, theirs, c, layoutSeed).gain);
  }
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
    const { newGrid, newCells } = expandMosaicTerritory(
      grid,
      mine,
      theirs,
      c,
      layoutSeed,
    );
    let reply = 0;
    for (let r = 0; r < colorCount; r++) {
      if (r === c || r === theirColor) continue;
      const g = expandMosaicTerritory(newGrid, theirs, newCells, r, layoutSeed).gain;
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
