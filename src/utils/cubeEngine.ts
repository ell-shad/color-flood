import type { GridSize } from '../types';
import { mulberry32, type Rng } from './engine';
import {
  maxSoloMovesLimit,
  rateSoloStarsWith,
  soloPar,
  type SoloStars,
} from './soloBalance';

/**
 * Cube surface boards.
 *
 * Storage follows the task contract: `grid` is `number[6N][N]`; face `f`,
 * local row `i`, local column `j` lives at `grid[f * N + i][j]`. Cell keys
 * therefore remain the existing `"r,c"` strings and diffs/replay/snapshots
 * need no new cell encoding.
 *
 * Adjacency is derived, not hand-tabled. Each face is parameterized as a
 * unit-square tiling of the surface `[0..N]^3`; a cell's four integer corner
 * points identify its four edges. Cells that share an edge are neighbors.
 * This gives every cell exactly four neighbors, including across the twelve
 * geometric cube edges.
 */

export type CubePoint = [number, number, number];

/** Ladder size → cube side length. Cube surface cells = 6 × side². */
export const CUBE_SIDE_BY_SIZE: Record<GridSize, number> = {
  10: 4,
  12: 5,
  14: 6,
  16: 7,
  18: 8,
};

export const cubeSideForSize = (size: number): number =>
  CUBE_SIDE_BY_SIZE[size as GridSize] ?? 4;

export const cubeCellCount = (side: number): number => 6 * side * side;

export const cubeCellCountForSize = (size: number): number =>
  cubeCellCount(cubeSideForSize(size));

/**
 * Move budget and star thresholds. Calibrated with `scripts/cubeSim.ts`
 * (500 seeds/config, greedy hint): a 1.05× solo-limit budget wins 100% of
 * the sampled boards with average need/budget ≈ 0.58–0.75, matching the
 * wheel's 0.58–0.76 in-family feel. The par scaling follows the wheel's
 * 0.85 rule so a typical greedy solve is around the 3-star boundary.
 */
export const CUBE_LIMIT_FACTOR = 1.05;
export const CUBE_PAR_FACTOR = 0.85;

export const getMaxCubeMoves = (size: number, colorCount: number): number =>
  Math.round(maxSoloMovesLimit(size, colorCount) * CUBE_LIMIT_FACTOR);

export const getCubePar = (size: number, colorCount: number): number =>
  Math.round(soloPar(size, colorCount) * CUBE_PAR_FACTOR);

export const rateCubeStars = (moves: number, size: number, colors: number): SoloStars =>
  rateSoloStarsWith(moves, getCubePar(size, colors), getMaxCubeMoves(size, colors));

const cellKey = (r: number, c: number): string => `${r},${c}`;
const readKey = (k: string): [number, number] => {
  const [r, c] = k.split(',');
  return [Number(r), Number(c)];
};

const cubeIndex = (r: number, c: number, side: number): number => r * side + c;
const indexToCell = (index: number, side: number): [number, number] => [
  Math.floor(index / side),
  index % side,
];

export const cubeSeedCell = (side: number): [number, number] => [
  Math.floor(side / 2),
  Math.floor(side / 2),
];
export const cubeSeedIndex = (side: number): number =>
  cubeIndex(...cubeSeedCell(side), side);

/**
 * Parameterize one point on a cube face. Local row/column are continuous
 * surface coordinates in `[0..side]`, so this also returns exact cell corners
 * and centers for any fractional local offset. The six cases choose an
 * orientation in which coincident surface edges share integer coordinates.
 */
const cubeFacePoint = (
  face: number,
  row: number,
  col: number,
  side: number,
): CubePoint => {
  switch (face) {
    case 0:
      return [0, col, row];
    case 1:
      return [side, side - col, row];
    case 2:
      return [col, 0, row];
    case 3:
      return [side - col, side, row];
    case 4:
      return [col, row, 0];
    case 5:
      return [side - col, row, side];
    default:
      throw new RangeError(`cube face out of range: ${face}`);
  }
};

const pointKey = (point: CubePoint): string => `${point[0]},${point[1]},${point[2]}`;
const edgeKey = (a: CubePoint, b: CubePoint): string =>
  [pointKey(a), pointKey(b)].sort().join('|');

interface CubeTopology {
  neighbors: number[][];
  centers: CubePoint[];
}

const topologyCache = new Map<number, CubeTopology>();

/**
 * Cached flat-index neighbor table and 3D cell centers for one cube side.
 * Neighbors are stored in deterministic flat-index order.
 */
export const cubeTopology = (side: number): CubeTopology => {
  const cached = topologyCache.get(side);
  if (cached) return cached;

  const totalCells = cubeCellCount(side);
  const centers: CubePoint[] = new Array(totalCells);
  const edgeToCells = new Map<string, number[]>();

  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        const r = face * side + i;
        const c = j;
        const index = cubeIndex(r, c, side);
        centers[index] = cubeFacePoint(face, i + 0.5, j + 0.5, side);

        // The four corners in local parameter order. Adjacent corners are
        // the cell's four geometric edges.
        const corners: CubePoint[] = [
          cubeFacePoint(face, i, j, side),
          cubeFacePoint(face, i, j + 1, side),
          cubeFacePoint(face, i + 1, j, side),
          cubeFacePoint(face, i + 1, j + 1, side),
        ];
        const edgePairs: Array<[number, number]> = [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
        ];
        for (const [a, b] of edgePairs) {
          const key = edgeKey(corners[a], corners[b]);
          const cells = edgeToCells.get(key) ?? [];
          cells.push(index);
          edgeToCells.set(key, cells);
        }
      }
    }
  }

  const neighbors: number[][] = Array.from({ length: totalCells }, () => []);
  for (const cells of edgeToCells.values()) {
    if (cells.length !== 2) {
      throw new Error(`cube topology edge has ${cells.length} incident cells`);
    }
    const [a, b] = cells;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  for (const list of neighbors) list.sort((a, b) => a - b);

  const topology = { neighbors, centers };
  topologyCache.set(side, topology);
  return topology;
};

/** Flat-index neighbors of one cube cell. */
export const cubeNeighborIndices = (r: number, c: number, side: number): number[] =>
  cubeTopology(side).neighbors[cubeIndex(r, c, side)];

/** `"r,c"` neighbors of one cube cell. */
export const cubeNeighbors = (
  r: number,
  c: number,
  side: number,
): Array<[number, number]> =>
  cubeNeighborIndices(r, c, side).map((index) => indexToCell(index, side));

/** 3D center of one cube cell (surface coordinates in `[0..side]^3`). */
export const cubeCellCenter = (r: number, c: number, side: number): CubePoint =>
  cubeTopology(side).centers[cubeIndex(r, c, side)];

/** Cell whose center is the reflection of the given cell's center. */
export const cubeAntipodeCell = (
  r: number,
  c: number,
  side: number,
): [number, number] => {
  const [x, y, z] = cubeCellCenter(r, c, side);
  const mirrored: CubePoint = [side - x, side - y, side - z];
  const { centers } = cubeTopology(side);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const distance =
      (centers[i][0] - mirrored[0]) ** 2 +
      (centers[i][1] - mirrored[1]) ** 2 +
      (centers[i][2] - mirrored[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return indexToCell(best, side);
};

export const cubeAntipodeIndex = (r: number, c: number, side: number): number =>
  cubeIndex(...cubeAntipodeCell(r, c, side), side);

/** Derive the cube side from a `number[6N][N]` grid, validating its shape. */
export const getCubeSide = (grid: number[][]): number => {
  if (grid.length < 6 || grid.length % 6 !== 0) {
    throw new RangeError(`cube grid must have 6N rows; got ${grid.length}`);
  }
  const side = grid.length / 6;
  if (!grid.every((row) => row.length === side)) {
    throw new RangeError(
      `cube grid must have N=${side} columns; got ${grid[0]?.length ?? 0}`,
    );
  }
  return side;
};

/**
 * Connected component containing one cell, in BFS discovery order.
 * For solo play this is the flood region; for 2P it is the territory seed.
 */
export const cubeComponent = (
  grid: number[][],
  startR: number,
  startC: number,
  color: number,
): string[] => {
  const side = getCubeSide(grid);
  const { neighbors } = cubeTopology(side);
  const start = cubeIndex(startR, startC, side);
  const seen = new Uint8Array(neighbors.length);
  const queue: number[] = [start];
  seen[start] = 1;
  const out: string[] = [cellKey(startR, startC)];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of neighbors[index]) {
      const [nr, nc] = indexToCell(next, side);
      if (!seen[next] && grid[nr][nc] === color) {
        seen[next] = 1;
        out.push(cellKey(nr, nc));
        queue.push(next);
      }
    }
  }
  return out;
};

/** Seeded cube generation (P6.3 convention: every board carries a seed). */
export const generateCubeBoard = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): number[][] => {
  const side = cubeSideForSize(size);
  const rows = 6 * side;
  return Array.from({ length: rows }, () =>
    Array.from({ length: side }, () => Math.floor(rng() * colorCount)),
  );
};

export const floodCube = (grid: number[][], targetColor: number): number[][] => {
  const side = getCubeSide(grid);
  const out = grid.map((row) => [...row]);
  const [seedR, seedC] = cubeSeedCell(side);
  const startColor = out[seedR][seedC];
  if (startColor === targetColor) return out;

  // The solo flood is the connected component containing the seed cell.
  const component = cubeComponent(out, seedR, seedC, startColor);
  for (const key of component) {
    const [r, c] = readKey(key);
    out[r][c] = targetColor;
  }
  return out;
};

export const checkCubeWin = (grid: number[][]): boolean => {
  const color = grid[0][0];
  return grid.every((row) => row.every((cell) => cell === color));
};

/** Size of the connected same-color region containing the seed cell. */
export const countConnectedCube = (grid: number[][]): number => {
  const side = getCubeSide(grid);
  const [seedR, seedC] = cubeSeedCell(side);
  return cubeComponent(grid, seedR, seedC, grid[seedR][seedC]).length;
};

export const bestCubeMove = (grid: number[][], colorCount: number): number | null =>
  bestCubeMoveWithGain(grid, colorCount)?.color ?? null;

/** Greedy hint plus its immediate flooded-cell gain (`(+n)` badge parity). */
export const bestCubeMoveWithGain = (
  grid: number[][],
  colorCount: number,
): { color: number; gain: number } | null => {
  if (checkCubeWin(grid)) return null;
  const side = getCubeSide(grid);
  const [seedR, seedC] = cubeSeedCell(side);
  const seedColor = grid[seedR][seedC];
  const before = countConnectedCube(grid);
  let best: { color: number; gain: number } | null = null;
  for (let c = 0; c < colorCount; c++) {
    if (c === seedColor) continue;
    const gain = countConnectedCube(floodCube(grid, c)) - before;
    if (gain > 0 && (best === null || gain > best.gain)) best = { color: c, gain };
  }
  return best;
};

// --- Two-player cube -------------------------------------------------------

export interface TwoPlayerCubeBoard {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
}

/**
 * Fair two-player cube: P1 starts at the solo seed cell and P2 at its
 * antipode. Different colors and non-overlapping components are required;
 * retries and a deterministic separated fallback mirror the wheel generator.
 */
export const generateTwoPlayerCube = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): TwoPlayerCubeBoard => {
  const side = cubeSideForSize(size);
  const [p1r, p1c] = cubeSeedCell(side);
  const [p2r, p2c] = cubeAntipodeCell(p1r, p1c, side);

  for (let attempt = 0; attempt < 100; attempt++) {
    const grid = generateCubeBoard(size, colorCount, rng);
    const p1Color = grid[p1r][p1c];
    let p2Color = grid[p2r][p2c];
    if (p2Color === p1Color) {
      p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
      grid[p2r][p2c] = p2Color;
    }
    const p1Cells = cubeComponent(grid, p1r, p1c, p1Color);
    const p2Cells = cubeComponent(grid, p2r, p2c, p2Color);
    const p2Set = new Set(p2Cells);
    if (!p1Cells.some((k) => p2Set.has(k))) {
      return { grid, p1Cells, p2Cells, p1Color, p2Color };
    }
  }

  // Guaranteed-separated fallback: the two antipodal cells have different
  // colors, so their same-color components cannot intersect.
  const grid = generateCubeBoard(size, colorCount, rng);
  grid[p1r][p1c] = 0;
  grid[p2r][p2c] = 1;
  return {
    grid,
    p1Cells: cubeComponent(grid, p1r, p1c, 0),
    p2Cells: cubeComponent(grid, p2r, p2c, 1),
    p1Color: 0,
    p2Color: 1,
  };
};

/**
 * Territory expansion on the cube: recolor owned cells, then BFS over the
 * derived surface graph; opponent cells are absolute barriers.
 */
export const expandCubeTerritory = (
  grid: number[][],
  currentCells: string[],
  opponentCells: string[],
  targetColor: number,
): { newGrid: number[][]; newCells: string[]; gain: number } => {
  const side = getCubeSide(grid);
  const { neighbors } = cubeTopology(side);
  const out = grid.map((row) => [...row]);
  const opponentSet = new Set(opponentCells);
  const owned = new Set<string>();
  const newCells: string[] = [];
  const queue: number[] = [];

  for (const key of currentCells) {
    if (owned.has(key)) continue;
    owned.add(key);
    const [r, c] = readKey(key);
    out[r][c] = targetColor;
    newCells.push(key);
    queue.push(cubeIndex(r, c, side));
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    for (const next of neighbors[index]) {
      const [nr, nc] = indexToCell(next, side);
      const key = cellKey(nr, nc);
      if (!owned.has(key) && !opponentSet.has(key) && out[nr][nc] === targetColor) {
        owned.add(key);
        newCells.push(key);
        queue.push(next);
      }
    }
  }

  return { newGrid: out, newCells, gain: newCells.length - currentCells.length };
};

/** Terminal check — majority, full-board and mutual-block rules. */
export const checkCubeMultiplayerGameOver = (
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
      (c) => expandCubeTerritory(grid, own, other, c).gain > 0,
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

/** Wheel-parity one-ply heuristic for easy/medium/master bots. */
export const bestCubeMultiplayerMove = (
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
  for (const c of legal) gains.set(c, expandCubeTerritory(grid, mine, theirs, c).gain);

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
    const { newGrid, newCells } = expandCubeTerritory(grid, mine, theirs, c);
    let reply = 0;
    for (let r = 0; r < colorCount; r++) {
      if (r === c || r === theirColor) continue;
      const g = expandCubeTerritory(newGrid, theirs, newCells, r).gain;
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
export const generateSeededCubeBoard = (
  size: number,
  colorCount: number,
  seed: number,
): number[][] => generateCubeBoard(size, colorCount, mulberry32(seed));
