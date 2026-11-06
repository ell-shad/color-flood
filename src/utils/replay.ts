import type { SoloMoveDiff } from '../types';

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
