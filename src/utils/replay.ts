import type { SoloMoveDiff, TwoPlayerMoveRecord } from '../types';

/**
 * P5.6 (moved here in P10.1 so the two-player machines record with the exact
 * same format): per-move repaint entries ({cell, previous color}) recomputed
 * from the boards before and after the move. The walk is per-ROW because
 * wheels (P7) are rings × sectors where sectors ≠ row count — the column
 * bound must come from each row's own length.
 */
export const buildMoveDiff = (before: number[][], after: number[][]): SoloMoveDiff[] => {
  const diff: SoloMoveDiff[] = [];
  for (let r = 0; r < before.length; r++) {
    for (let c = 0; c < before[r].length; c++) {
      if (before[r][c] !== after[r][c]) diff.push({ r, c, prev: before[r][c] });
    }
  }
  return diff;
};

/**
 * P6.3: reconstructs the board state after every move of a finished game,
 * using the per-move repaint DIFF history recorded by the solo machine
 * (P5.6). Pure — the live game state is never touched by a replay.
 *
 * The walk is BACKWARD from the final grid, which is the only complete board
 * the running app holds: state i is the board after move i (so index 0 is
 * the initial board).
 */
export const reconstructReplayStates = (
  finalGrid: number[][],
  history: SoloMoveDiff[][],
): number[][][] => {
  const rows = finalGrid.length;
  const states: number[][][] = new Array(history.length).fill(null);
  let current = finalGrid.map((row) => [...row]);
  for (let i = history.length - 1; i >= 0; i--) {
    states[i] = current;
    current = current.map((row) => [...row]);
    const diff = history[i];
    for (const { r, c, prev } of diff) {
      // P7.3: wheel boards are rings × sectors (rows ≠ columns), so the bound
      // comes from each row's own length — not the row count.
      if (r >= 0 && r < rows && c >= 0 && c < current[r].length) current[r][c] = prev;
    }
  }
  return states;
};

// --- Two-player reconstruction (P10.2) --------------------------------------

/**
 * P10.2: one snapped state of a two-player replay — the board colors and
 * whose land is what at that point of the round.
 */
export interface TwoPlayerReplayState {
  grid: number[][];
  p1Cells: string[];
  p2Cells: string[];
}

/**
 * P10.2: rebuilds every state of a finished two-player round, BACKWARD from
 * the final board the running app holds (mirror of the solo walk above):
 *
 *  - colors undo through the recorded repaint diffs of each move, and
 *  - ownership undoes by removing each move's `gained` keys from the mover's
 *    territory — territory only ever grows, so removal restores it exactly
 *    (pinned by the engine-contract tests and by the forward-parity suite).
 *
 * Returned index i is the state after i moves (0 = the opening board,
 * moves.length = the finished board), matching the solo modal's transport.
 * Pure — the live game state is never touched.
 */
export const reconstructTwoPlayerReplayStates = (
  finalGrid: number[][],
  finalP1Cells: string[],
  finalP2Cells: string[],
  moves: TwoPlayerMoveRecord[],
): TwoPlayerReplayState[] => {
  const rows = finalGrid.length;
  const n = moves.length;
  const states: TwoPlayerReplayState[] = new Array(n + 1).fill(null);

  states[n] = {
    grid: finalGrid.map((row) => [...row]),
    p1Cells: [...finalP1Cells],
    p2Cells: [...finalP2Cells],
  };

  for (let i = n; i > 0; i--) {
    const move = moves[i - 1];
    // Boards stay independent copies — no state shares a reference.
    const grid = states[i].grid.map((row) => [...row]);
    for (const { r, c, prev } of move.diff) {
      if (r >= 0 && r < rows && c >= 0 && c < grid[r].length) grid[r][c] = prev;
    }

    // Ownership: drop this move's gains from the mover's land (defensively
    // guarded — a key that was never owned would stay, never corrupt state).
    const gainedSet = new Set(move.gained);
    const dropGained = (keys: string[]) =>
      gainedSet.size === 0 ? [...keys] : keys.filter((k) => !gainedSet.has(k));
    const p1Cells =
      move.player === 1 ? dropGained(states[i].p1Cells) : [...states[i].p1Cells];
    const p2Cells =
      move.player === 2 ? dropGained(states[i].p2Cells) : [...states[i].p2Cells];

    states[i - 1] = { grid, p1Cells, p2Cells };
  }
  return states;
};
