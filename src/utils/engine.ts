import { BotDifficulty, PlayerId } from '../types';

/**
 * FLAT ENGINE — the single pure engine shared by client and server.
 *
 * Representation: row-major flat grids (`Uint8Array`, one byte per cell) instead of
 * `number[][]`; indices (`0..size*size-1`) instead of "r,c" string keys; BFS through an
 * `Int32Array` ring-buffer queue instead of `array.shift()` (O(1) vs O(n) per pop).
 *
 * All functions are pure: they never mutate their inputs (except where documented as
 * returning the identical reference for cheap equality, mirroring the legacy API).
 *
 * Neighbor order in every BFS is preserved from the legacy implementation:
 * down, up, right, left. Do not reorder — tests assert exact BFS discovery order.
 *
 * NOTE on squareness: the legacy engine used `grid.length` for column bounds, i.e. it
 * only supported square grids. The flat engine takes an explicit `size` and always
 * assumes an N x N board (the game only ever builds square boards).
 */

export type Rng = () => number;

/** Deterministic, seedable RNG (mulberry32). Default RNG at call sites stays Math.random. */
export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Random 32-bit seed for reproducible boards (daily challenge, share links, tests). */
export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0;

export const toFlat = (grid: number[][]): Uint8Array => {
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    if (grid[r].length !== size) {
      throw new RangeError('engine expects a square NxN grid');
    }
  }
  const cells = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    const row = grid[r];
    for (let c = 0; c < size; c++) cells[r * size + c] = row[c];
  }
  return cells;
};

export const toNested = (cells: Uint8Array, size: number): number[][] => {
  const grid: number[][] = [];
  for (let r = 0; r < size; r++) {
    const row: number[] = new Array(size);
    for (let c = 0; c < size; c++) row[c] = cells[r * size + c];
    grid.push(row);
  }
  return grid;
};

/** Reusable ring-buffer frame so hot loops never allocate `shift()`-style arrays. */
const makeQueue = (capacity: number): { q: Int32Array; head: number; tail: number } => ({
  q: new Int32Array(capacity),
  head: 0,
  tail: 0,
});

/**
 * Solo flood: recolors the connected component of `cells[0]` to `targetColor`.
 * Always returns a fresh copy (callers implement the same-reference shortcut).
 * Expansion matches against the ORIGINAL grid colors, like the legacy implementation.
 */
export const floodFlat = (
  cells: Uint8Array,
  size: number,
  targetColor: number,
): Uint8Array => {
  const out = cells.slice();
  const startColor = cells[0];
  if (startColor === targetColor) return out;

  const total = size * size;
  const visited = new Uint8Array(total);
  const { q, head: h0, tail: t0 } = makeQueue(total);
  let head = h0;
  let tail = t0;
  q[tail++] = 0;
  visited[0] = 1;

  while (head < tail) {
    const idx = q[head++];
    out[idx] = targetColor;
    const col = idx % size;
    const down = idx + size;
    if (down < total && visited[down] === 0 && cells[down] === startColor) {
      visited[down] = 1;
      q[tail++] = down;
    }
    const up = idx - size;
    if (up >= 0 && visited[up] === 0 && cells[up] === startColor) {
      visited[up] = 1;
      q[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (visited[right] === 0 && cells[right] === startColor) {
        visited[right] = 1;
        q[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (visited[left] === 0 && cells[left] === startColor) {
        visited[left] = 1;
        q[tail++] = left;
      }
    }
  }
  return out;
};

/**
 * Indices (in BFS discovery order) of the connected component of `targetColor`
 * containing `startIdx`. Mirrors the legacy quirk: the start cell is always included
 * even when its own color differs — expansion then proceeds into matching neighbors.
 */
export const connectedRegionFlat = (
  cells: Uint8Array,
  size: number,
  startIdx: number,
  targetColor: number,
): number[] => {
  const total = size * size;
  const visited = new Uint8Array(total);
  const { q, head: h0, tail: t0 } = makeQueue(total);
  let head = h0;
  let tail = t0;
  const result: number[] = [startIdx];
  q[tail++] = startIdx;
  visited[startIdx] = 1;

  while (head < tail) {
    const idx = q[head++];
    const col = idx % size;
    const down = idx + size;
    if (down < total && visited[down] === 0 && cells[down] === targetColor) {
      visited[down] = 1;
      result.push(down);
      q[tail++] = down;
    }
    const up = idx - size;
    if (up >= 0 && visited[up] === 0 && cells[up] === targetColor) {
      visited[up] = 1;
      result.push(up);
      q[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (visited[right] === 0 && cells[right] === targetColor) {
        visited[right] = 1;
        result.push(right);
        q[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (visited[left] === 0 && cells[left] === targetColor) {
        visited[left] = 1;
        result.push(left);
        q[tail++] = left;
      }
    }
  }
  return result;
};

/** Count-only variant of the region containing cell 0 matching the start color. */
export const countRegionFlat = (cells: Uint8Array, size: number): number => {
  const startColor = cells[0];
  const total = size * size;
  const visited = new Uint8Array(total);
  const { q, head: h0, tail: t0 } = makeQueue(total);
  let head = h0;
  let tail = t0;
  let count = 0;
  q[tail++] = 0;
  visited[0] = 1;

  while (head < tail) {
    const idx = q[head++];
    count++;
    const col = idx % size;
    const down = idx + size;
    if (down < total && visited[down] === 0 && cells[down] === startColor) {
      visited[down] = 1;
      q[tail++] = down;
    }
    const up = idx - size;
    if (up >= 0 && visited[up] === 0 && cells[up] === startColor) {
      visited[up] = 1;
      q[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (visited[right] === 0 && cells[right] === startColor) {
        visited[right] = 1;
        q[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (visited[left] === 0 && cells[left] === startColor) {
        visited[left] = 1;
        q[tail++] = left;
      }
    }
  }
  return count;
};

export interface TerritoryExpandResult {
  newGrid: Uint8Array;
  newCells: number[];
  gain: number;
}

/**
 * Player territory expansion: recolors every current cell to `targetColor`, then floods
 * into adjacent targetColor cells that are neutral (never into opponent cells).
 * `newCells` preserves insertion order: original cells first, then BFS discoveries.
 */
export const expandTerritoryFlat = (
  cells: Uint8Array,
  size: number,
  currentIdx: readonly number[],
  opponentIdx: readonly number[],
  targetColor: number,
): TerritoryExpandResult => {
  const newGrid = cells.slice();
  const total = size * size;
  const opponentSet = new Uint8Array(total);
  for (const i of opponentIdx) opponentSet[i] = 1;

  const owned = new Uint8Array(total);
  const newCells: number[] = [];
  const { q, head: h0, tail: t0 } = makeQueue(total);
  let head = h0;
  let tail = t0;

  for (const i of currentIdx) {
    if (!owned[i]) {
      owned[i] = 1;
      newGrid[i] = targetColor;
      newCells.push(i);
      q[tail++] = i;
    }
  }

  while (head < tail) {
    const idx = q[head++];
    const col = idx % size;
    const down = idx + size;
    if (
      down < total &&
      owned[down] === 0 &&
      opponentSet[down] === 0 &&
      newGrid[down] === targetColor
    ) {
      owned[down] = 1;
      newCells.push(down);
      q[tail++] = down;
    }
    const up = idx - size;
    if (
      up >= 0 &&
      owned[up] === 0 &&
      opponentSet[up] === 0 &&
      newGrid[up] === targetColor
    ) {
      owned[up] = 1;
      newCells.push(up);
      q[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (
        owned[right] === 0 &&
        opponentSet[right] === 0 &&
        newGrid[right] === targetColor
      ) {
        owned[right] = 1;
        newCells.push(right);
        q[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (owned[left] === 0 && opponentSet[left] === 0 && newGrid[left] === targetColor) {
        owned[left] = 1;
        newCells.push(left);
        q[tail++] = left;
      }
    }
  }

  return {
    newGrid,
    newCells,
    gain: newCells.length - currentIdx.length,
  };
};

/**
 * Gain-only expansion — identical semantics to `expandTerritoryFlat` without building
 * the newCells list or the recolored grid. Used by bots and legality checks that only
 * need the numeric gain, cutting per-simulation allocations in half.
 */
export const expandTerritoryGainFlat = (
  cells: Uint8Array,
  size: number,
  currentIdx: readonly number[],
  opponentIdx: readonly number[],
  targetColor: number,
): number => {
  const total = size * size;
  const opponentSet = new Uint8Array(total);
  for (const i of opponentIdx) opponentSet[i] = 1;

  const owned = new Uint8Array(total);
  const q = new Int32Array(total);
  let head = 0;
  let tail = 0;
  let count = 0;

  for (const i of currentIdx) {
    if (!owned[i]) {
      owned[i] = 1;
      count++;
      q[tail++] = i;
    }
  }

  while (head < tail) {
    const idx = q[head++];
    const col = idx % size;
    const down = idx + size;
    if (
      down < total &&
      owned[down] === 0 &&
      opponentSet[down] === 0 &&
      cells[down] === targetColor
    ) {
      owned[down] = 1;
      count++;
      q[tail++] = down;
    }
    const up = idx - size;
    if (
      up >= 0 &&
      owned[up] === 0 &&
      opponentSet[up] === 0 &&
      cells[up] === targetColor
    ) {
      owned[up] = 1;
      count++;
      q[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (
        owned[right] === 0 &&
        opponentSet[right] === 0 &&
        cells[right] === targetColor
      ) {
        owned[right] = 1;
        count++;
        q[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (owned[left] === 0 && opponentSet[left] === 0 && cells[left] === targetColor) {
        owned[left] = 1;
        count++;
        q[tail++] = left;
      }
    }
  }

  return count - currentIdx.length;
};

/**
 * Neither player may pick their own color or their opponent's color.
 */
export const legalColorsFlat = (
  p1Color: number,
  p2Color: number,
  colorCount: number,
): number[] => {
  const legal: number[] = [];
  for (let i = 0; i < colorCount; i++) {
    if (i !== p1Color && i !== p2Color) legal.push(i);
  }
  return legal;
};

/**
 * Best solo move (greedy): keep the color whose flood grows the region the most.
 *
 * Fast equivalent of legacy flood-then-count: after flooding, the region containing
 * cell 0 is the startColor component S (all recolored) plus the targetColor cells
 * reachable from S through targetColor cells only. startColor cells OUTSIDE S keep
 * their old color in the flooded grid, so they must NOT be traversable (path nodes are
 * restricted to S-members for startColor and to targetColor cells elsewhere).
 * Proven equivalent to the legacy oracle in engineParity.test.ts.
 */
export const bestSoloMoveFlat = (
  cells: Uint8Array,
  size: number,
  colorCount: number,
): number | null => {
  const total = size * size;
  const startColor = cells[0];

  // 1. Component S of the start color.
  const inS = new Uint8Array(total);
  const q0 = new Int32Array(total);
  let head = 0;
  let tail = 0;
  let countS = 0;
  q0[tail++] = 0;
  inS[0] = 1;
  while (head < tail) {
    const idx = q0[head++];
    countS++;
    const col = idx % size;
    const down = idx + size;
    if (down < total && inS[down] === 0 && cells[down] === startColor) {
      inS[down] = 1;
      q0[tail++] = down;
    }
    const up = idx - size;
    if (up >= 0 && inS[up] === 0 && cells[up] === startColor) {
      inS[up] = 1;
      q0[tail++] = up;
    }
    if (col + 1 < size) {
      const right = idx + 1;
      if (inS[right] === 0 && cells[right] === startColor) {
        inS[right] = 1;
        q0[tail++] = right;
      }
    }
    if (col > 0) {
      const left = idx - 1;
      if (inS[left] === 0 && cells[left] === startColor) {
        inS[left] = 1;
        q0[tail++] = left;
      }
    }
  }

  // 2. Per candidate: |S| plus the targetColor cells reachable from S.
  let bestColor = -1;
  let maxSize = -1;
  const visited = new Uint8Array(total);
  const q = new Int32Array(total);

  for (let target = 0; target < colorCount; target++) {
    if (target === startColor) continue;
    visited.set(inS);
    head = 0;
    tail = 0;
    for (let i = 0; i < total; i++) {
      if (inS[i]) q[tail++] = i;
    }
    let connected = countS;

    while (head < tail) {
      const idx = q[head++];
      const col = idx % size;
      const down = idx + size;
      if (down < total && visited[down] === 0 && cells[down] === target) {
        visited[down] = 1;
        connected++;
        q[tail++] = down;
      }
      const up = idx - size;
      if (up >= 0 && visited[up] === 0 && cells[up] === target) {
        visited[up] = 1;
        connected++;
        q[tail++] = up;
      }
      if (col + 1 < size) {
        const right = idx + 1;
        if (visited[right] === 0 && cells[right] === target) {
          visited[right] = 1;
          connected++;
          q[tail++] = right;
        }
      }
      if (col > 0) {
        const left = idx - 1;
        if (visited[left] === 0 && cells[left] === target) {
          visited[left] = 1;
          connected++;
          q[tail++] = left;
        }
      }
    }

    if (connected > maxSize) {
      maxSize = connected;
      bestColor = target;
    }
  }
  return bestColor !== -1 ? bestColor : null;
};

export interface BotMoveResult {
  bestColor: number;
  maxGain: number;
  evaluations: Record<number, number>;
}

export interface MinimaxOptions {
  /** Hard ply cap (iterative deepening stops here). */
  maxDepth?: number;
  /** Deterministic node budget — the search aborts and keeps the last completed depth. */
  nodeBudget?: number;
  /** Optional wall-clock budget for the browser (checked every 256 nodes). */
  deadlineMs?: number;
  /** Injectable clock so tests can stay deterministic. */
  now?: () => number;
}

const COUNT_WEIGHT = 100;
const FRONTIER_CELL_WEIGHT = 2;
const FRONTIER_COLOR_WEIGHT = 3;

interface FrontierInfo {
  cells: number;
  colors: number;
}

/**
 * Neutral cells adjacent to a territory and how many distinct neutral colors they
 * have. Fewer distinct frontier colors is slightly better (more focused capture).
 */
const frontierInfo = (
  cells: Uint8Array,
  size: number,
  ownIdx: readonly number[],
  oppSet: Uint8Array,
  scratch: Uint8Array,
  scratchColors: Uint8Array,
): FrontierInfo => {
  if (ownIdx.length === 0) return { cells: 0, colors: 0 };
  const total = size * size;
  const ownColor = cells[ownIdx[0]];
  scratch.fill(0);
  scratchColors.fill(0);
  let count = 0;
  let colorKinds = 0;

  for (const i of ownIdx) {
    const col = i % size;
    // down / up / right / left
    const down = i + size;
    if (down < total) {
      const c = cells[down];
      if (c !== ownColor && oppSet[down] === 0 && scratch[down] === 0) {
        scratch[down] = 1;
        count++;
        if (scratchColors[c] === 0) {
          scratchColors[c] = 1;
          colorKinds++;
        }
      }
    }
    const up = i - size;
    if (up >= 0) {
      const c = cells[up];
      if (c !== ownColor && oppSet[up] === 0 && scratch[up] === 0) {
        scratch[up] = 1;
        count++;
        if (scratchColors[c] === 0) {
          scratchColors[c] = 1;
          colorKinds++;
        }
      }
    }
    if (col + 1 < size) {
      const right = i + 1;
      const c = cells[right];
      if (c !== ownColor && oppSet[right] === 0 && scratch[right] === 0) {
        scratch[right] = 1;
        count++;
        if (scratchColors[c] === 0) {
          scratchColors[c] = 1;
          colorKinds++;
        }
      }
    }
    if (col > 0) {
      const left = i - 1;
      const c = cells[left];
      if (c !== ownColor && oppSet[left] === 0 && scratch[left] === 0) {
        scratch[left] = 1;
        count++;
        if (scratchColors[c] === 0) {
          scratchColors[c] = 1;
          colorKinds++;
        }
      }
    }
  }
  return { cells: count, colors: colorKinds };
};

/**
 * Master bot: time-boxed depth-limited minimax with alpha-beta.
 *
 * Evaluation (from P1's perspective): territory difference + frontier cell count
 * (reachable neutral cells bordering the territory) − distinct frontier color count,
 * plus a decisive bonus for holding a majority. Moves are ordered by immediate gain
 * for pruning. Iterative deepening keeps the best move from the last fully completed
 * depth when the node/clock budget runs out, so results are deterministic for a fixed
 * node budget (tests) and never block the caller for long (worker + deadlineMs).
 */
export const bestMultiplayerMoveMinimaxFlat = (
  cells: Uint8Array,
  size: number,
  activePlayer: PlayerId,
  p1Idx: readonly number[],
  p2Idx: readonly number[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  options: MinimaxOptions = {},
): BotMoveResult => {
  const total = size * size;
  const majorityThreshold = Math.floor(total / 2) + 1;
  const maxDepth = options.maxDepth ?? (total > 256 ? 5 : 6);
  const nodeBudget = options.nodeBudget ?? 250_000;
  const useClock = options.deadlineMs !== undefined && options.now !== undefined;
  const deadline = useClock ? options.now!() + options.deadlineMs! : Infinity;
  const now = options.now ?? Date.now;

  const myIdx = activePlayer === 1 ? p1Idx : p2Idx;
  const oppIdx = activePlayer === 1 ? p2Idx : p1Idx;
  const myColor = activePlayer === 1 ? p1Color : p2Color;
  const oppColor = activePlayer === 1 ? p2Color : p1Color;
  const isP1 = activePlayer === 1;

  const evaluations: Record<number, number> = {};
  const legal = legalColorsFlat(myColor, oppColor, colorCount);
  for (const c of legal) {
    evaluations[c] = expandTerritoryGainFlat(cells, size, myIdx, oppIdx, c);
  }
  if (legal.length === 0) {
    return { bestColor: 0, maxGain: 0, evaluations: {} };
  }

  // Root move order: highest immediate gain first (better pruning + sane fallback).
  const ordered = [...legal].sort((a, b) => evaluations[b] - evaluations[a]);
  let bestColor = ordered[0];

  const scratch = new Uint8Array(total);
  const scratchColors = new Uint8Array(16);
  const oppSet = new Uint8Array(total);

  const evaluate = (
    board: Uint8Array,
    boardP1: readonly number[],
    boardP2: readonly number[],
  ): number => {
    const p1Count = boardP1.length;
    const p2Count = boardP2.length;
    if (p1Count >= majorityThreshold) return 1_000_000 + p1Count;
    if (p2Count >= majorityThreshold) return -1_000_000 - p2Count;

    oppSet.fill(0);
    for (const i of boardP2) oppSet[i] = 1;
    const f1 = frontierInfo(board, size, boardP1, oppSet, scratch, scratchColors);

    oppSet.fill(0);
    for (const i of boardP1) oppSet[i] = 1;
    const f2 = frontierInfo(board, size, boardP2, oppSet, scratch, scratchColors);

    return (
      COUNT_WEIGHT * (p1Count - p2Count) +
      FRONTIER_CELL_WEIGHT * (f1.cells - f2.cells) +
      FRONTIER_COLOR_WEIGHT * (f2.colors - f1.colors)
    );
  };

  let nodes = 0;
  let aborted = false;

  const search = (
    board: Uint8Array,
    boardP1: readonly number[],
    boardP2: readonly number[],
    boardP1Color: number,
    boardP2Color: number,
    turn: PlayerId,
    depth: number,
    alpha: number,
    beta: number,
  ): number => {
    nodes++;
    if (nodes > nodeBudget || (useClock && (nodes & 255) === 0 && now() > deadline)) {
      aborted = true;
      return evaluate(board, boardP1, boardP2);
    }
    if (depth === 0) return evaluate(board, boardP1, boardP2);

    const turnIsP1 = turn === 1;
    const tIdx = turnIsP1 ? boardP1 : boardP2;
    const oIdx = turnIsP1 ? boardP2 : boardP1;
    const tColor = turnIsP1 ? boardP1Color : boardP2Color;
    const oColor = turnIsP1 ? boardP2Color : boardP1Color;

    const moves = legalColorsFlat(tColor, oColor, colorCount)
      .map((c) => [c, expandTerritoryGainFlat(board, size, tIdx, oIdx, c)] as const)
      .sort((x, y) => y[1] - x[1]);
    if (moves.length === 0) return evaluate(board, boardP1, boardP2);

    let best = turnIsP1 ? -Infinity : Infinity;
    for (const [c] of moves) {
      const { newGrid, newCells } = expandTerritoryFlat(board, size, tIdx, oIdx, c);
      const value = search(
        newGrid,
        turnIsP1 ? newCells : boardP1,
        turnIsP1 ? boardP2 : newCells,
        turnIsP1 ? c : boardP1Color,
        turnIsP1 ? boardP2Color : c,
        turnIsP1 ? 2 : 1,
        depth - 1,
        alpha,
        beta,
      );
      if (turnIsP1) {
        if (value > best) best = value;
        if (best > alpha) alpha = best;
      } else {
        if (value < best) best = value;
        if (best < beta) beta = best;
      }
      if (beta <= alpha) break;
    }
    return best;
  };

  for (let depth = 1; depth <= maxDepth; depth++) {
    aborted = false;
    let depthBest = ordered[0];
    let depthValue = isP1 ? -Infinity : Infinity;
    for (const c of ordered) {
      const { newGrid, newCells } = expandTerritoryFlat(cells, size, myIdx, oppIdx, c);
      const value = search(
        newGrid,
        isP1 ? newCells : p1Idx,
        isP1 ? p2Idx : newCells,
        isP1 ? c : p1Color,
        isP1 ? p2Color : c,
        isP1 ? 2 : 1,
        depth - 1,
        -Infinity,
        Infinity,
      );
      if (aborted) break;
      if (isP1 ? value > depthValue : value < depthValue) {
        depthValue = value;
        depthBest = c;
      }
    }
    if (aborted) break;
    bestColor = depthBest;
  }

  return { bestColor, maxGain: evaluations[bestColor] ?? 0, evaluations };
};

export interface BotMoveOptions extends MinimaxOptions {
  /**
   * Injectable RNG for the easy bot's random choice — lets seeded tests exercise
   * the easy path deterministically. Defaults to Math.random (legacy behavior).
   */
  rng?: Rng;
}

/**
 * Best multiplayer move for a player or AI bot.
 * - easy: seeded-random-ish greedy (0.6 random) — legacy behavior
 * - medium: greedy highest immediate gain — legacy behavior
 * - master: depth-limited alpha-beta minimax (bestMultiplayerMoveMinimaxFlat)
 */
export const bestMultiplayerMoveFlat = (
  cells: Uint8Array,
  size: number,
  activePlayer: PlayerId,
  p1Idx: readonly number[],
  p2Idx: readonly number[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
  difficulty: BotDifficulty = 'master',
  options: BotMoveOptions = {},
): BotMoveResult => {
  const currentIdx = activePlayer === 1 ? p1Idx : p2Idx;
  const opponentIdx = activePlayer === 1 ? p2Idx : p1Idx;
  const myColor = activePlayer === 1 ? p1Color : p2Color;
  const oppColor = activePlayer === 1 ? p2Color : p1Color;

  const legal = legalColorsFlat(myColor, oppColor, colorCount);
  const evaluations: Record<number, number> = {};

  if (legal.length === 0) {
    return { bestColor: 0, maxGain: 0, evaluations: {} };
  }

  for (const c of legal) {
    evaluations[c] = expandTerritoryGainFlat(cells, size, currentIdx, opponentIdx, c);
  }

  const rng = options.rng ?? Math.random;

  // Easy bot: 60% chance to pick a random legal color, otherwise falls through to
  // the master-style lookahead below (legacy behavior).
  if (difficulty === 'easy' && rng() < 0.6) {
    const randomColor = legal[Math.floor(rng() * legal.length)];
    return {
      bestColor: randomColor,
      maxGain: evaluations[randomColor] || 0,
      evaluations,
    };
  }

  // Medium bot: purely greedy (highest immediate gain, first-max tie-break).
  if (difficulty === 'medium') {
    let bestC = legal[0];
    let maxG = -1;
    for (const c of legal) {
      const g = evaluations[c];
      if (g > maxG) {
        maxG = g;
        bestC = c;
      }
    }
    return { bestColor: bestC, maxGain: maxG, evaluations };
  }

  // Master bot: depth-limited alpha-beta minimax (replaces the legacy one-move
  // lookahead in P2.6; the legacy heuristic stays exported for the parity oracle).
  const minimax = bestMultiplayerMoveMinimaxFlat(
    cells,
    size,
    activePlayer,
    p1Idx,
    p2Idx,
    p1Color,
    p2Color,
    colorCount,
    options,
  );
  return {
    bestColor: minimax.bestColor,
    maxGain: minimax.maxGain,
    evaluations,
  };
};

/**
 * Legacy master heuristic (verbatim, kept as the parity-suite oracle): one-move
 * lookahead — gain*1.5 minus 0.8 * opponent's best reply gain.
 */
export const bestMultiplayerMoveLegacyMasterFlat = (
  cells: Uint8Array,
  size: number,
  activePlayer: PlayerId,
  p1Idx: readonly number[],
  p2Idx: readonly number[],
  p1Color: number,
  p2Color: number,
  colorCount: number,
): BotMoveResult => {
  const currentIdx = activePlayer === 1 ? p1Idx : p2Idx;
  const opponentIdx = activePlayer === 1 ? p2Idx : p1Idx;
  const myColor = activePlayer === 1 ? p1Color : p2Color;
  const oppColor = activePlayer === 1 ? p2Color : p1Color;

  const legal = legalColorsFlat(myColor, oppColor, colorCount);
  const evaluations: Record<number, number> = {};

  if (legal.length === 0) {
    return { bestColor: 0, maxGain: 0, evaluations: {} };
  }

  for (const c of legal) {
    evaluations[c] = expandTerritoryGainFlat(cells, size, currentIdx, opponentIdx, c);
  }

  let bestScore = -Infinity;
  let bestColor = legal[0];
  for (const c of legal) {
    const { newGrid, newCells, gain } = expandTerritoryFlat(
      cells,
      size,
      currentIdx,
      opponentIdx,
      c,
    );
    const opponentLegal = legalColorsFlat(c, oppColor, colorCount);
    let maxOppGain = 0;
    for (const oppC of opponentLegal) {
      const simGain = expandTerritoryGainFlat(newGrid, size, opponentIdx, newCells, oppC);
      if (simGain > maxOppGain) maxOppGain = simGain;
    }
    const strategicScore = gain * 1.5 - maxOppGain * 0.8;
    if (strategicScore > bestScore) {
      bestScore = strategicScore;
      bestColor = c;
    }
  }

  return { bestColor, maxGain: evaluations[bestColor] || 0, evaluations };
};

export type MultiplayerOutcome = 'playing' | 'p1_won' | 'p2_won' | 'draw';

/**
 * Terminal-state check for territory battle. Mirrors the legacy logic exactly.
 */
export const checkMultiplayerGameOverFlat = (
  totalCells: number,
  p1Count: number,
  p2Count: number,
  colorCount: number,
  p1Color: number,
  p2Color: number,
  cells: Uint8Array,
  size: number,
  p1Idx: readonly number[],
  p2Idx: readonly number[],
): MultiplayerOutcome => {
  const majorityThreshold = Math.floor(totalCells / 2) + 1;

  if (p1Count >= majorityThreshold) return 'p1_won';
  if (p2Count >= majorityThreshold) return 'p2_won';

  if (p1Count + p2Count >= totalCells) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  const p1Legal = legalColorsFlat(p1Color, p2Color, colorCount);
  const p2Legal = legalColorsFlat(p2Color, p1Color, colorCount);

  const p1CanGain = p1Legal.some(
    (c) => expandTerritoryGainFlat(cells, size, p1Idx, p2Idx, c) > 0,
  );
  const p2CanGain = p2Legal.some(
    (c) => expandTerritoryGainFlat(cells, size, p2Idx, p1Idx, c) > 0,
  );

  if (!p1CanGain && !p2CanGain) {
    if (p1Count > p2Count) return 'p1_won';
    if (p2Count > p1Count) return 'p2_won';
    return 'draw';
  }

  return 'playing';
};

/** Seeded solo board generator (row-major rng call order, like the legacy function). */
export const generateSoloGridFlat = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): Uint8Array => {
  const cells = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) cells[i] = Math.floor(rng() * colorCount);
  return cells;
};

export interface TwoPlayerBoardFlat {
  cells: Uint8Array;
  size: number;
  p1Idx: number[];
  p2Idx: number[];
  p1Color: number;
  p2Color: number;
}

/**
 * Fair 2-player board: opposite corners start with different colors and the starting
 * territories do not overlap. Call order of `rng` matches the legacy implementation.
 */
export const generateTwoPlayerGridFlat = (
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): TwoPlayerBoardFlat => {
  const lastIdx = size * size - 1;
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const cells = generateSoloGridFlat(size, colorCount, rng);

    const p1Color = cells[0];
    let p2Color = cells[lastIdx];

    if (p2Color === p1Color) {
      p2Color = (p1Color + 1 + Math.floor(rng() * (colorCount - 1))) % colorCount;
      cells[lastIdx] = p2Color;
    }

    const p1Idx = connectedRegionFlat(cells, size, 0, p1Color);
    const p2Idx = connectedRegionFlat(cells, size, lastIdx, p2Color);

    const p2Set = new Set(p2Idx);
    const hasOverlap = p1Idx.some((c) => p2Set.has(c));

    if (!hasOverlap) {
      return { cells, size, p1Idx, p2Idx, p1Color, p2Color };
    }
  }

  // Fallback guaranteed separation
  const cells = generateSoloGridFlat(size, colorCount, rng);
  const p1Color = 0;
  const p2Color = 1;
  cells[0] = p1Color;
  cells[lastIdx] = p2Color;
  const p1Idx = connectedRegionFlat(cells, size, 0, p1Color);
  const p2Idx = connectedRegionFlat(cells, size, lastIdx, p2Color);
  return { cells, size, p1Idx, p2Idx, p1Color, p2Color };
};
