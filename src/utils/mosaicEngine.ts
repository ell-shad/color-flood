import type { GridSize } from '../types';
import { mulberry32, type Rng } from './engine';
import {
  maxSoloMovesLimit,
  rateSoloStarsWith,
  soloPar,
  type SoloStars,
} from './soloBalance';

/**
 * P13 — Mosaic boards (irregular polygonal tiling, solo only).
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
 * The polygon layout is derived from the side alone (fixed PRNG seed), so a
 * layout can be regenerated anywhere — engine, board, tests — from the grid
 * dimensions, with no extra state to thread through the game.
 *
 * Multiplayer is flat-board only (P11.7 rule: the cube is the only 3D solo
 * shape, and the mosaic follows the same solo-only convention), so this module
 * has no two-player kernels.
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
  /** Index of the cell whose site is closest to the board centre. */
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
const diagramOf = (sites: Point[]): { polygons: Point[][]; neighbours: number[][] } => {
  const n = sites.length;
  const polygons: Point[][] = [];

  for (let i = 0; i < n; i++) {
    let poly = squarePolygon();
    for (let j = 0; j < n && poly.length >= 3; j++) {
      if (j === i) continue;
      poly = clipToBisector(poly, sites[i], sites[j]);
    }
    polygons.push(poly.length >= 3 ? poly : squarePolygon());
  }

  const neighbours: number[][] = polygons.map((poly, i) => {
    const adj: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const own = sites[i];
      const other = sites[j];
      const dx = other[0] - own[0];
      const dy = other[1] - own[1];
      const mx = (own[0] + other[0]) / 2;
      const my = (own[1] + other[1]) / 2;
      const onBisector = (p: Point) =>
        Math.abs(dx * (p[0] - mx) + dy * (p[1] - my)) < 1e-9;
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length > 1e-6 && onBisector(a) && onBisector(b)) {
          adj.push(j);
          break;
        }
      }
    }
    return adj;
  });

  return { polygons, neighbours };
};

const buildLayout = (side: number): MosaicLayout => {
  const rng = mulberry32((0x5eed1a3 ^ (side * 2654435761)) >>> 0);
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
    const diagram = diagramOf(sites);
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
  let best = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i].site;
    const d = (x - 0.5) ** 2 + (y - 0.5) ** 2;
    if (d < best) {
      best = d;
      seed = i;
    }
  }

  return { side, cells, seed };
};

const layoutCache = new Map<number, MosaicLayout>();

/** Layout for a board side (cells per row); generated once and cached. */
export const mosaicLayout = (side: number): MosaicLayout => {
  const key = Math.max(2, Math.floor(side));
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = buildLayout(key);
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

/** The solo flood origin: `[r, c]` of the cell nearest the board centre. */
export const mosaicSeedCell = (side: number): [number, number] => {
  const { seed } = mosaicLayout(side);
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
): number[][] => {
  const side = mosaicSide(size);
  const grid: number[][] = Array.from({ length: side }, () =>
    Array.from({ length: side }, () => Math.floor(rng() * colorCount)),
  );
  // A monochrome board would be won before the first move.
  const [sr, sc] = mosaicSeedCell(side);
  const seedColor = grid[sr][sc];
  if (grid.every((row) => row.every((cell) => cell === seedColor))) {
    grid[(sr + 1) % side][(sc + 1) % side] = (seedColor + 1) % colorCount;
  }
  return grid;
};

/** Cell indices of the connected region of `color` containing the origin. */
const originRegion = (grid: number[][], color: number): number[] => {
  const side = grid.length;
  const { cells, seed } = mosaicLayout(side);
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
const distanceCache = new Map<number, Int16Array>();

export const mosaicDistanceField = (side: number): Int16Array => {
  const cached = distanceCache.get(side);
  if (cached) return cached;
  const { cells, seed } = mosaicLayout(side);
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
  distanceCache.set(side, distances);
  return distances;
};

export const floodMosaic = (grid: number[][], targetColor: number): number[][] => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side);
  const startColor = grid[sr][sc];
  if (startColor === targetColor) return grid;
  const out = grid.map((row) => [...row]);
  for (const index of originRegion(grid, startColor)) {
    out[rowOf(index, side)][colOf(index, side)] = targetColor;
  }
  return out;
};

export const checkMosaicWin = (grid: number[][]): boolean => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side);
  const color = grid[sr][sc];
  return grid.every((row) => row.every((cell) => cell === color));
};

export const countConnectedMosaic = (grid: number[][]): number => {
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side);
  return originRegion(grid, grid[sr][sc]).length;
};

/**
 * Greedy hint (same role as the square/wheel chip): the colour whose immediate
 * flood claims the most cells, ties to the lower palette index.
 */
export const bestMosaicMoveWithGain = (
  grid: number[][],
  colorCount: number,
): { color: number; gain: number } | null => {
  if (checkMosaicWin(grid)) return null;
  const side = grid.length;
  const [sr, sc] = mosaicSeedCell(side);
  const seedColor = grid[sr][sc];
  const before = countConnectedMosaic(grid);
  let best: { color: number; gain: number } | null = null;
  for (let color = 0; color < colorCount; color++) {
    if (color === seedColor) continue;
    const gain = countConnectedMosaic(floodMosaic(grid, color)) - before;
    if (gain > 0 && (best === null || gain > best.gain)) best = { color, gain };
  }
  return best;
};

export const bestMosaicMove = (grid: number[][], colorCount: number): number | null =>
  bestMosaicMoveWithGain(grid, colorCount)?.color ?? null;

/**
 * Move budget and stars.
 *
 * A mosaic cell has ~5.5 neighbours instead of 4, so its flood grows faster
 * than the square's. The factor is measured against the greedy solver in
 * `scripts/mosaicSim.ts` (500 seeds/config): the budget keeps the same
 * "competent player always finishes, sloppy play does not" band as the other
 * boards, and par sits at 0.85× of the same limit.
 */
export const MOSAIC_LIMIT_FACTOR = 0.9;
export const MOSAIC_PAR_FACTOR = 0.85;

export const getMaxMosaicMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * MOSAIC_LIMIT_FACTOR);

export const getMosaicPar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * MOSAIC_PAR_FACTOR);

export const rateMosaicStars = (moves: number, size: number, colors: number): SoloStars =>
  rateSoloStarsWith(moves, getMosaicPar(size, colors), getMaxMosaicMoves(size, colors));
