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
 * P14 — hexagon-hive board.
 *
 * Regular pointy-top hexagons are laid out in a staggered lattice and scaled
 * uniformly into the unit square. Adjacency is derived from shared polygon
 * edges, so the flood walks the visible honeycomb walls.
 *
 * Storage remains `number[rows][cols]` and `"r,c"` cell keys: row `r`, column
 * `c` is one hexagonal cell. The same graph powers two-player hive, seeded at
 * the bottom and top centres.
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

export const hiveDimensions = (size: number): [number, number] => {
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

/** The opposite multiplayer seed: the top-centre hexagon. */
export const hiveTopSeedCell = (rows: number, cols: number): [number, number] => [
  0,
  Math.floor(cols / 2),
];

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

// --- Two-player hive ---------------------------------------------------------

export interface TwoPlayerHiveBoard {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

const hiveComponentFrom = (
  grid: number[][],
  start: number,
  color: number,
  rows: number,
  cols: number,
): string[] => {
  const { cells } = hiveLayout(rows, cols);
  const seen = new Uint8Array(cells.length);
  const queue: number[] = [start];
  seen[start] = 1;
  const out: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      if (!seen[next] && grid[Math.floor(next / cols)][next % cols] === color) {
        seen[next] = 1;
        out.push(next);
        queue.push(next);
      }
    }
  }
  return out.map((index) => `${Math.floor(index / cols)},${index % cols}`);
};

/**
 * Two-player hive board: P1 starts at the bottom-centre hexagon and P2 at the
 * top-centre hexagon.
 */
export const generateTwoPlayerHive = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): TwoPlayerHiveBoard => {
  const [rows, cols] = hiveDimensions(size);
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(rng() * colorCount)),
  );
  // P1 shares the solo flood origin so both modes read the same start cell;
  // the staggered lattice can shift it by one column from `floor(cols / 2)`.
  const [p1r, p1c] = hiveSeedCell(rows, cols);
  const p1Index = p1r * cols + p1c;
  const [p2r, p2c] = hiveTopSeedCell(rows, cols);
  const p2Index = p2r * cols + p2c;
  const p1Color = grid[p1r][p1c];
  const p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
  grid[p2r][p2c] = p2Color;
  return {
    grid,
    p1Cells: hiveComponentFrom(grid, p1Index, p1Color, rows, cols),
    p2Cells: hiveComponentFrom(grid, p2Index, p2Color, rows, cols),
    p1Color,
    p2Color,
  };
};

/** Territory expansion over the honeycomb adjacency graph. */
export const expandHiveTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
): { newGrid: number[][]; newCells: string[]; gain: number } => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const { cells } = hiveLayout(rows, cols);
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
    queue.push(r * cols + c);
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of cells[index].neighbours) {
      const key = `${Math.floor(next / cols)},${next % cols}`;
      if (
        !owned.has(key) &&
        !opponentSet.has(key) &&
        out[Math.floor(next / cols)][next % cols] === targetColor
      ) {
        owned.add(key);
        newCells.push(key);
        queue.push(next);
      }
    }
  }

  return { newGrid: out, newCells, gain: newCells.length - currentCells.length };
};

export const checkHiveMultiplayerGameOver = (
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
  const canGain = (
    own: string[],
    other: string[],
    ownColor: number,
    otherColor: number,
  ) =>
    legal(ownColor, otherColor).some(
      (c) => expandHiveTerritory(grid, own, other, c).gain > 0,
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

/** Same one-ply easy/medium/master heuristic as wheel and cube. */
export const bestHiveMultiplayerMove = (
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
  for (const c of legal) {
    gains.set(c, expandHiveTerritory(grid, mine, theirs, c).gain);
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
    const { newGrid, newCells } = expandHiveTerritory(grid, mine, theirs, c);
    let reply = 0;
    for (let r = 0; r < colorCount; r++) {
      if (r === c || r === theirColor) continue;
      const g = expandHiveTerritory(newGrid, theirs, newCells, r).gain;
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
