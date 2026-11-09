import type { SoloMoveDiff } from '../types';

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
