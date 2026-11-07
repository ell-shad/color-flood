import type { BotDifficulty, BoardShape } from '../types';
import { getBestMoveForShape } from './floodLogic';
import type { BotWorkerRequest, BotWorkerResponse } from './botWorker';

/**
 * Singleton Web Worker client for bot moves (P2.7). Falls back to synchronous
 * computation when workers are unavailable (old browsers, test environments).
 *
 * P9: the request carries the board topology — wheels are searched with the
 * polar kernels, squares keep the flat alpha-beta engine.
 */

const FALLBACK_DEADLINE_MS = 600;

let worker: Worker | null = null;
let workerBroken = false;

const getWorker = (): Worker | null => {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    if (typeof Worker === 'undefined') {
      workerBroken = true;
      return null;
    }
    worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
};

export interface BotMoveRequest {
  grid: number[][];
  activePlayer: 1 | 2;
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
  colorCount: number;
  /** Board topology (omitted ⇒ classic square, e.g. legacy callers/tests). */
  shape?: BoardShape;
  difficulty: BotDifficulty;
}

/** Same computation the worker runs, on the main thread (fallback path). */
const computeSync = (req: BotMoveRequest): number =>
  getBestMoveForShape(
    req.shape ?? 'classic',
    req.grid,
    req.activePlayer,
    req.p1Cells,
    req.p2Cells,
    req.p1Color,
    req.p2Color,
    req.colorCount,
    req.difficulty,
  ).bestColor;

/**
 * Compute the bot's move. Off the main thread when workers work; resolves with the
 * chosen color either way (caller is responsible for staleness guards).
 */
export const requestBotMove = (req: BotMoveRequest): Promise<number> =>
  new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      // Synchronous fallback (blocking; rare — only when workers are unavailable).
      resolve(computeSync(req));
      return;
    }

    const payload: BotWorkerRequest = {
      id: Date.now() + Math.random(),
      ...req,
      deadlineMs: FALLBACK_DEADLINE_MS,
    };

    const onMessage = (ev: MessageEvent<BotWorkerResponse>) => {
      if (ev.data.id !== payload.id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve(ev.data.bestColor);
    };
    const onError = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      workerBroken = true;
      resolve(computeSync(req));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    try {
      w.postMessage(payload);
    } catch {
      // Structured-clone failure or detached worker: synchronous fallback.
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve(computeSync(req));
    }
  });
