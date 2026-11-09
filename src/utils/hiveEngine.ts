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
 * P14 — hexagon-hive board (solo only).
 *
 * Regular pointy-top hexagons are laid out in a staggered lattice and scaled
 * uniformly into the unit square. Adjacency is derived from shared polygon
 * edges, so the flood walks the visible honeycomb walls.
 *
 * Storage remains `number[rows][cols]` and `"r,c"` cell keys: row `r`, column
 * `c` is one hexagonal cell.
 */

export interface HiveCell {
  site: Point;
  polygon: Point[];
  neighbours: number[];
}

export interface HiveLayout {
  rows: number;
  cols: number;
  cells: HiveCell[];
  /** Index of the bottom-centre hexagon. */
  seed: number;
}

const SQRT3 = Math.sqrt(3);

const buildHiveLayout = (rows: number, cols: number): HiveLayout => {
  // Provisional centres in an unscaled pointy-top honeycomb.
  const raw: Point[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5 + (r % 2) * 0.5) * SQRT3;
      const y = (r + 0.5) * 1.5;
      raw.push([x, y]);
    }
  }

  // Hexagon vertices for one provisional unit radius.
  const verticesFor = (center: Point): Point[] =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = Math.PI / 6 + (i * Math.PI) / 3;
      return [center[0] + Math.cos(angle), center[1] + Math.sin(angle)];
    });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const center of raw) {
    for (const [x, y] of verticesFor(center)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const scale = 0.995 / Math.max(maxX - minX, maxY - minY);
  const shiftX = -minX * scale;
  const shiftY = -minY * scale;
  const normalize = (point: Point): Point => [
    point[0] * scale + shiftX,
    point[1] * scale + shiftY,
  ];

  const cells: HiveCell[] = raw.map((center) => {
    const site = normalize(center);
    const polygon = verticesFor(center).map(normalize as (point: Point) => Point);
    return { site, polygon, neighbours: [] };
  });

  // Honeycomb neighbours are determined by the staggered lattice geometry
  // directly; deriving them from floating-point polygon edges would be both
  // slower and brittle after uniform scaling.
  cells.forEach((cell, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const candidateRows: Array<[number, number]> = [
      [row, col - 1],
      [row, col + 1],
      [row - 1, row % 2 === 0 ? col - 1 : col],
      [row - 1, row % 2 === 0 ? col : col + 1],
      [row + 1, row % 2 === 0 ? col - 1 : col],
      [row + 1, row % 2 === 0 ? col : col + 1],
    ];
    for (const [candidateRow, candidateCol] of candidateRows) {
      if (
        candidateRow < 0 ||
        candidateRow >= rows ||
        candidateCol < 0 ||
        candidateCol >= cols
      ) {
        continue;
      }
      const other = candidateRow * cols + candidateCol;
      if (!cell.neighbours.includes(other)) cell.neighbours.push(other);
    }
  });

  let seed = 0;
  let seedScore = Infinity;
  cells.forEach((cell, index) => {
    const [x, y] = cell.site;
    const score = (1 - y) * 2 + Math.abs(x - 0.5);
    if (score < seedScore) {
      seedScore = score;
      seed = index;
    }
  });

  return { rows, cols, cells, seed };
};

const layoutCache = new Map<string, HiveLayout>();

/** Layout for explicit hive-grid dimensions. */
export const hiveLayout = (rows: number, cols: number): HiveLayout => {
  const normalizedRows = Math.max(1, Math.floor(rows));
  const normalizedCols = Math.max(1, Math.floor(cols));
  const key = `${normalizedRows}x${normalizedCols}`;
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = buildHiveLayout(normalizedRows, normalizedCols);
    layoutCache.set(key, layout);
  }
  return layout;
};

const hiveDimensions = (size: number): [number, number] => {
  const ladder: Record<GridSize, [number, number]> = {
    10: [10, 9],
    12: [12, 10],
    14: [14, 12],
    16: [16, 14],
    18: [18, 16],
  };
  return ladder[size as GridSize] ?? [10, 9];
};

/** Layout for one of the supported ladder sizes. */
export const hiveLayoutForSize = (size: number): HiveLayout => {
  const [rows, cols] = hiveDimensions(size);
  return hiveLayout(rows, cols);
};

export const hiveCellCount = (size: number): number => {
  const [rows, cols] = hiveDimensions(size);
  return rows * cols;
};

/** The solo flood origin: the bottom-centre hexagon. */
export const hiveSeedCell = (rows: number, cols: number): [number, number] => {
  const { seed } = hiveLayout(rows, cols);
  return [Math.floor(seed / cols), seed % cols];
};

/** Seeded board generation. */
export const generateHiveBoard = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): number[][] => {
  const [rows, cols] = hiveDimensions(size);
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(rng() * colorCount)),
  );
  const [sr, sc] = hiveSeedCell(rows, cols);
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
  const { cells, seed } = hiveLayout(rows, cols);
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

/** Graph distance (cells) from the bottom-centre hexagon. */
export const hiveDistanceField = (rows: number, cols: number): Int16Array => {
  const key = `${rows}x${cols}`;
  const cached = distanceCache.get(key);
  if (cached) return cached;
  const { cells, seed } = hiveLayout(rows, cols);
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

export const floodHive = (grid: number[][], targetColor: number): number[][] => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = hiveSeedCell(rows, cols);
  const startColor = grid[sr][sc];
  if (startColor === targetColor) return grid;
  const out = grid.map((row) => [...row]);
  for (const index of originRegion(grid, startColor)) {
    out[rowOf(index, cols)][colOf(index, cols)] = targetColor;
  }
  return out;
};

export const checkHiveWin = (grid: number[][]): boolean => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = hiveSeedCell(rows, cols);
  const color = grid[sr][sc];
  return grid.every((row) => row.every((cell) => cell === color));
};

export const countConnectedHive = (grid: number[][]): number => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = hiveSeedCell(rows, cols);
  return originRegion(grid, grid[sr][sc]).length;
};

export const bestHiveMoveWithGain = (
  grid: number[][],
  colorCount: number,
): { color: number; gain: number } | null => {
  if (checkHiveWin(grid)) return null;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const [sr, sc] = hiveSeedCell(rows, cols);
  const seedColor = grid[sr][sc];
  const before = countConnectedHive(grid);
  let best: { color: number; gain: number } | null = null;
  for (let color = 0; color < colorCount; color++) {
    if (color === seedColor) continue;
    const gain = countConnectedHive(floodHive(grid, color)) - before;
    if (gain > 0 && (best === null || gain > best.gain)) best = { color, gain };
  }
  return best;
};

export const bestHiveMove = (grid: number[][], colorCount: number): number | null =>
  bestHiveMoveWithGain(grid, colorCount)?.color ?? null;

/**
 * Hexagons have six edge neighbours, so this flood can spread faster than the
 * square board; `0.9` is retained while the project calibration is updated.
 */
export const HIVE_LIMIT_FACTOR = 0.9;
export const HIVE_PAR_FACTOR = 0.85;

export const getMaxHiveMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * HIVE_LIMIT_FACTOR);

export const getHivePar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * HIVE_PAR_FACTOR);

export const rateHiveStars = (moves: number, size: number, colors: number): SoloStars =>
  rateSoloStarsWith(moves, getHivePar(size, colors), getMaxHiveMoves(size, colors));
