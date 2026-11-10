import { getBestMoveForShape } from './floodLogic';
import type { BotDifficulty, BoardShape } from '../types';

/**
 * Web Worker entry for the master bot minimax (P2.7). Runs the alpha-beta search off
 * the main thread so depth-5/6 searches never freeze the UI. The client wrapper
 * (botWorkerClient.ts) owns fallback behavior if workers are unavailable.
 */

export interface BotWorkerRequest {
  id: number;
  grid: number[][];
  activePlayer: 1 | 2;
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
  colorCount: number;
  /** P9: board topology — wheels use the polar search. */
  shape?: BoardShape;
  /** P14: mosaic geometry seed for non-square territory layouts. */
  layoutSeed?: number;
  difficulty: BotDifficulty;
  /** Wall-clock cap for the search; checked every 256 nodes. */
  deadlineMs?: number;
}

export interface BotWorkerResponse {
  id: number;
  bestColor: number;
  maxGain: number;
}

self.onmessage = (e: MessageEvent<BotWorkerRequest>) => {
  const req = e.data;
  let bestColor = 0;
  try {
    const { bestColor: move } = getBestMoveForShape(
      req.shape ?? 'classic',
      req.grid,
      req.activePlayer,
      req.p1Cells,
      req.p2Cells,
      req.p1Color,
      req.p2Color,
      req.colorCount,
      req.difficulty,
      { deadlineMs: req.deadlineMs, now: () => performance.now() },
      req.layoutSeed,
    );
    bestColor = move;
  } catch {
    // Defensive: never leave the main thread waiting — respond with 0 (should not happen).
    bestColor = 0;
  }
  const response: BotWorkerResponse = {
    id: req.id,
    bestColor,
    maxGain: 0,
  };
  self.postMessage(response);
};
