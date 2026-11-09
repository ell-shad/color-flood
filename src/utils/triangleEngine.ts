import type { GridSize } from '../types';
import type { Point } from './mosaicEngine';
import type { Rng } from './engine';
import {
  maxSoloMovesLimit,
  rateSoloStarsWith,
  soloPar,
  type SoloStars,
} from './soloBalance';

/**
 * P14 — triangle board (solo only).
 *
 * A triangle tiling of the square: horizontal strips are divided into
 * alternating up/down right triangles, and every stored cell is one of those
 * triangles. Adjacency is derived from the shared polygon edges, so the flood
 * walks exactly the edges the player can see.
 *
 * Storage remains the game-wide `number[rows][cols]` grid: row `r`, column
 * `c` is a right triangle. A ladder size maps to `rows = size / 2` and
 * `cols = 2 * size`, so the board still has `size²` cells.
 */

export interface TriangleCell {
  site: Point;
  polygon: Point[];
  neighbours: number[];
}

export interface TriangleLayout {
  rows: number;
  cols: number;
  cells: TriangleCell[];
  /** Index of the bottom-centre triangle. */
  seed: number;
}

const pointKey = (point: Point): string =>
  `${Math.round(point[0] * 1e8)},${Math.round(point[1] * 1e8)}`;
const edgeKey = (a: Point, b: Point): string =>
  [pointKey(a), pointKey(b)].sort().join('|');

const buildTriangleLayout = (rows: number, cols: number): TriangleLayout => {
  const cells: TriangleCell[] = [];
  const edgeToCells = new Map<string, number[]>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const pair = Math.floor(c / 2);
      const x0 = pair / (cols / 2);
      const x1 = (pair + 1) / (cols / 2);
      const y0 = r / rows;
      const y1 = (r + 1) / rows;
      const polygon: Point[] =
        c % 2 === 0
          ? [
              [x0, y0],
              [x1, y0],
              [x0, y1],
            ]
          : [
              [x1, y0],
              [x0, y1],
              [x1, y1],
            ];
      const site: Point = [
        (polygon[0][0] + polygon[1][0] + polygon[2][0]) / 3,
        (polygon[0][1] + polygon[1][1] + polygon[2][1]) / 3,
      ];
      cells.push({ site, polygon, neighbours: [] });

      const edges: Array<[number, number]> = [
        [0, 1],
        [1, 2],
        [2, 0],
      ];
      for (const [a, b] of edges) {
        const key = edgeKey(polygon[a], polygon[b]);
        const found = edgeToCells.get(key) ?? [];
        found.push(index);
        edgeToCells.set(key, found);
      }
    }
  }

  for (const found of edgeToCells.values()) {
    const [a, b] = found;
    if (a === undefined || b === undefined) continue;
    if (!cells[a].neighbours.includes(b)) cells[a].neighbours.push(b);
    if (!cells[b].neighbours.includes(a)) cells[b].neighbours.push(a);
  }

  const seed = (rows - 1) * cols + Math.floor(cols / 2);
  return { rows, cols, cells, seed };
};

const layoutCache = new Map<string, TriangleLayout>();

/** Layout for explicit triangular-grid dimensions. */
export const triangleLayout = (rows: number, cols: number): TriangleLayout => {
  const normalizedRows = Math.max(1, Math.floor(rows));
  const normalizedCols = Math.max(1, Math.floor(cols));
  const key = `${normalizedRows}x${normalizedCols}`;
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = buildTriangleLayout(normalizedRows, normalizedCols);
    layoutCache.set(key, layout);
  }
  return layout;
};

const triangleDimensions = (size: number): [number, number] => {
  const ladder: Record<GridSize, [number, number]> = {
    10: [5, 20],
    12: [6, 24],
    14: [7, 28],
    16: [8, 32],
    18: [9, 36],
  };
  return ladder[size as GridSize] ?? [5, 20];
};

/** Layout for one of the supported ladder sizes. */
export const triangleLayoutForSize = (size: number): TriangleLayout => {
  const [rows, cols] = triangleDimensions(size);
  return triangleLayout(rows, cols);
};

export const triangleCellCount = (size: number): number => {
  const [rows, cols] = triangleDimensions(size);
  return rows * cols;
};

/** The solo flood origin: the bottom-centre triangle. */
export const triangleSeedCell = (rows: number, cols: number): [number, number] => [
  rows - 1,
  Math.floor(cols / 2),
];

/** Seeded board generation. */
export const generateTriangleBoard = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): number[][] => {
  const [rows, cols] = triangleDimensions(size);
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(rng() * colorCount)),
  );
  const [sr, sc] = triangleSeedCell(rows, cols);
  const seedColor = grid[sr][sc];
  if (grid.every((row) => row.every((cell) => cell === seedColor))) {
    grid[(sr + 1) % rows][(sc + 1) % cols] = (seedColor + 1) % colorCount;
  }
  return grid;
};

const rowOf = (index: number, cols: number): number => Math.floor(index / cols);
const colOf = (index: number, cols: number): number => index % cols;

const originRegion = (grid: number[][], color: number): number[] => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const { cells, seed } = triangleLayout(rows, cols);
  const seen = new Uint8Array(cells.length);
  const queue: number[] = [seed];
  seen[seed] = 1;
  const out: number[] = [seed];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      if (!seen[next] && grid[rowOf(next, cols)][colOf(next, cols)] === color) {
        seen[next] = 1;
        out.push(next);
        queue.push(next);
      }
    }
  }
  return out;
};

const distanceCache = new Map<string, Int16Array>();

/** Graph distance (cells) from the bottom-centre triangle. */
export const triangleDistanceField = (rows: number, cols: number): Int16Array => {
  const key = `${rows}x${cols}`;
  const cached = distanceCache.get(key);
  if (cached) return cached;
  const { cells, seed } = triangleLayout(rows, cols);
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
  distanceCache.set(key, distances);
  return distances;
};

export const floodTriangle = (grid: number[][], targetColor: number): number[][] => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = triangleSeedCell(rows, cols);
  const startColor = grid[sr][sc];
  if (startColor === targetColor) return grid;
  const out = grid.map((row) => [...row]);
  for (const index of originRegion(grid, startColor)) {
    out[rowOf(index, cols)][colOf(index, cols)] = targetColor;
  }
  return out;
};

export const checkTriangleWin = (grid: number[][]): boolean => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = triangleSeedCell(rows, cols);
  const color = grid[sr][sc];
  return grid.every((row) => row.every((cell) => cell === color));
};

export const countConnectedTriangle = (grid: number[][]): number => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = triangleSeedCell(rows, cols);
  return originRegion(grid, grid[sr][sc]).length;
};

export const bestTriangleMoveWithGain = (
  grid: number[][],
  colorCount: number,
): { color: number; gain: number } | null => {
  if (checkTriangleWin(grid)) return null;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = triangleSeedCell(rows, cols);
  const seedColor = grid[sr][sc];
  const before = countConnectedTriangle(grid);
  let best: { color: number; gain: number } | null = null;
  for (let color = 0; color < colorCount; color++) {
    if (color === seedColor) continue;
    const gain = countConnectedTriangle(floodTriangle(grid, color)) - before;
    if (gain > 0 && (best === null || gain > best.gain)) best = { color, gain };
  }
  return best;
};

export const bestTriangleMove = (grid: number[][], colorCount: number): number | null =>
  bestTriangleMoveWithGain(grid, colorCount)?.color ?? null;

/**
 * A triangle has only three edge neighbors, so its flood spreads more slowly
 * than a square's four-neighbour flood. The greedy simulation in
 * `scripts/triangleHiveSim.ts` shows a 1.6× budget is needed for a reliably
 * solvable triangle board.
 */
export const TRIANGLE_LIMIT_FACTOR = 1.6;
export const TRIANGLE_PAR_FACTOR = 0.85;

export const getMaxTriangleMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * TRIANGLE_LIMIT_FACTOR);

export const getTrianglePar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * TRIANGLE_PAR_FACTOR);

export const rateTriangleStars = (
  moves: number,
  size: number,
  colors: number,
): SoloStars =>
  rateSoloStarsWith(
    moves,
    getTrianglePar(size, colors),
    getMaxTriangleMoves(size, colors),
  );
