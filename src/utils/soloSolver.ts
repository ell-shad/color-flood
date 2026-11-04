import { bestSoloMoveFlat, floodFlat, toNested, type Rng } from './engine';

/**
 * Solo solvers used for balance calibration and the sim script.
 *
 * All of these operate on flat grids and are deterministic given an rng.
 * playGreedy uses the exact same best-move rule as the in-game hint.
 */

const isSolved = (cells: Uint8Array): boolean => {
  const c0 = cells[0];
  for (let i = 0; i < cells.length; i++) if (cells[i] !== c0) return false;
  return true;
};

export interface GreedyResult {
  moves: number;
  solved: boolean;
}

/**
 * Plays exactly like the in-game hint (getBestSoloMove semantics) until the board
 * is one color or the move budget is exhausted: the "own greedy hint" baseline.
 */
export const playGreedy = (
  cells: Uint8Array,
  size: number,
  colorCount: number,
  maxMoves: number,
): GreedyResult => {
  let state = cells.slice();
  let moves = 0;
  while (moves < maxMoves) {
    if (isSolved(state)) return { moves, solved: true };
    const bestColor = bestSoloMoveFlat(state, size, colorCount);
    if (bestColor === null) return { moves, solved: isSolved(state) };
    state = floodFlat(state, size, bestColor);
    moves++;
    if (isSolved(state)) return { moves, solved: true };
  }
  return { moves, solved: isSolved(state) };
};

interface BeamState {
  cells: Uint8Array;
  moves: number;
  connected: number;
}

const connectedSize = (cells: Uint8Array, size: number): number => {
  const color = cells[0];
  const visited = new Uint8Array(size * size);
  const q = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  let count = 1;
  q[tail++] = 0;
  visited[0] = 1;
  while (head < tail) {
    const idx = q[head++];
    const col = idx % size;
    const down = idx + size;
    if (down < size * size && visited[down] === 0 && cells[down] === color) {
      visited[down] = 1;
      count++;
      q[tail++] = down;
    }
    const up = idx - size;
    if (up >= 0 && visited[up] === 0 && cells[up] === color) {
      visited[up] = 1;
      count++;
      q[tail++] = up;
    }
    if (col + 1 < size && visited[idx + 1] === 0 && cells[idx + 1] === color) {
      visited[idx + 1] = 1;
      count++;
      q[tail++] = idx + 1;
    }
    if (col > 0 && visited[idx - 1] === 0 && cells[idx - 1] === color) {
      visited[idx - 1] = 1;
      count++;
      q[tail++] = idx - 1;
    }
  }
  return count;
};

export interface BeamResult {
  moves: number;
  solved: boolean;
}

/**
 * Level-synchronous beam search over flood sequences.
 * Returns the shortest solution found within the move cap, or solved:false.
 */
export const playBeam = (
  cells: Uint8Array,
  size: number,
  colorCount: number,
  maxMoves: number,
  beamWidth: number,
): BeamResult => {
  const total = size * size;
  const key = (c: Uint8Array) => c.join(',');
  const seen = new Map<string, number>(); // best moves per grid state

  let beam: BeamState[] = [
    { cells: cells.slice(), moves: 0, connected: connectedSize(cells, size) },
  ];
  if (beam[0].connected === total) return { moves: 0, solved: true };

  for (let level = 1; level <= maxMoves; level++) {
    const children: BeamState[] = [];
    for (const state of beam) {
      const startColor = state.cells[0];
      for (let c = 0; c < colorCount; c++) {
        if (c === startColor) continue;
        const next = floodFlat(state.cells, size, c);
        const k = key(next);
        const prevMoves = seen.get(k);
        if (prevMoves !== undefined && prevMoves <= level) continue;
        seen.set(k, level);
        const connected = connectedSize(next, size);
        if (connected === total) return { moves: level, solved: true };
        children.push({ cells: next, moves: level, connected });
      }
    }
    if (children.length === 0) break;
    // Rank: bigger connected region first; on ties prefer... connectivity alone is a
    // strong signal for flood-it beams. Stable sort keeps generation order ties.
    children.sort((a, b) => b.connected - a.connected);
    beam = children.slice(0, beamWidth);
  }
  return { moves: maxMoves, solved: false };
};

/** Convenience: seed a board exactly like the game's solo generator. */
export const seededSoloBoard = (
  size: number,
  colorCount: number,
  rng: Rng,
): Uint8Array => {
  const cells = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) cells[i] = Math.floor(rng() * colorCount);
  return cells;
};

export const showBoard = (cells: Uint8Array, size: number): number[][] =>
  toNested(cells, size);
