import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import type {
  SoloGameState,
  HighScore,
  GridSize,
  ColorCount,
  BoardShape,
} from '../types';
import { generateSoloGrid, floodSolo, checkSoloWin } from '../utils/floodLogic';
import {
  generateWheelBoard,
  floodWheel,
  checkWheelWin,
  getMaxWheelMoves,
} from '../utils/circleEngine';
import { buildMoveDiff } from '../utils/replay';
import { assertNever, parseBoardShape } from '../utils/boardShape';
import { mulberry32 } from '../utils/engine';
import { maxSoloMovesLimit } from '../utils/soloBalance';
import { loadJson, saveJson } from '../utils/storage';
import { z } from 'zod';

/**
 * P4.3: solo mode as a useReducer state machine.
 * Actions: init a fresh board, flood a color (engine calls live inside the
 * reducer so `move` is a pure state transformation). Side effects
 * (confetti/sound/high-scores) are delegated to the `onWin`/`onLose` callbacks
 * so the reducer stays pure and App keeps presentation concerns.
 */

// --- High scores (persisted per config) --------------------------------------

const HighScoreSchema = z.object({
  // P7.3: rows written before shapes existed load as classic square records.
  shape: z.enum(['classic', 'wheel']).optional(),
  size: z.number().int().min(5).max(30),
  colors: z.number().int().min(2).max(12),
  moves: z.number().int().min(1).max(9999),
});
const HighScoresSchema = z.array(HighScoreSchema).max(100);

export const loadHighScores = (): HighScore[] =>
  (loadJson('high-scores', HighScoresSchema, 'color-flood-high-scores') ?? []).map(
    (s) => ({
      shape: parseBoardShape(s.shape),
      size: s.size,
      colors: s.colors,
      moves: s.moves,
    }),
  );

/**
 * P7.3: upsert one record keyed by TOPOLOGY + config. Wheels are rated on
 * their own par table, so a wheel best never overwrites a square best (or the
 * reverse). Pure; equal/worse scores return the same array.
 */
export const upsertHighScore = (
  prev: HighScore[],
  shape: BoardShape,
  size: GridSize,
  colors: ColorCount,
  moves: number,
): HighScore[] => {
  const idx = prev.findIndex(
    (s) => s.shape === shape && s.size === size && s.colors === colors,
  );
  if (idx > -1) {
    if (moves >= prev[idx].moves) return prev;
    const next = [...prev];
    next[idx] = { shape, size, colors, moves };
    return next;
  }
  return [...prev, { shape, size, colors, moves }];
};

// --- Reducer -----------------------------------------------------------------

/**
 * P5.6: history stores one repaint DIFF per move ({cell, previous color})
 * instead of a full grid snapshot — 18x18 grids no longer snapshot 324 rows
 * per move and undo restores exactly the cells the flood recolored
 * (absorbed cells already had the move color, so they need no entry).
 * P10.1: the diff builder itself now lives in `utils/replay.ts` so the
 * two-player machines record with the exact same format.
 */

type SoloAction =
  | {
      type: 'init';
      size: GridSize;
      colors: ColorCount;
      shape?: BoardShape;
      seed?: number;
    }
  | { type: 'move'; color: number }
  | { type: 'undo' };

/** Uniform random 32-bit seed share links can encode (URL-safe integer). */
const randomSeed32 = (): number => (Math.random() * 2 ** 32) >>> 0;

const soloReducer = (
  state: SoloGameState | null,
  action: SoloAction,
): SoloGameState | null => {
  switch (action.type) {
    case 'init': {
      // P6.3: EVERY board is seeded — explicit seeding is the daily
      // challenge (P6.1) and shared links; plain play draws a fresh random
      // seed so any finished game can produce its own share link.
      const seed = action.seed ?? randomSeed32();
      const shape: BoardShape = action.shape ?? 'classic';
      // P7: wheels are grids[rings][sectors] (uniform inner ring seed); the
      // move budget is the calibrated 0.9× solo limit, so parity with the
      // beam-calibrated square difficulty carries over.
      let grid: number[][];
      let maxMoves: number;
      switch (shape) {
        case 'wheel':
          grid = generateWheelBoard(action.size, action.colors, mulberry32(seed));
          maxMoves = getMaxWheelMoves(action.size, action.colors);
          break;
        case 'classic':
          grid = generateSoloGrid(action.size, action.colors, mulberry32(seed));
          maxMoves = maxSoloMovesLimit(action.size, action.colors);
          break;
        default:
          return assertNever(shape);
      }
      return {
        grid,
        moves: 0,
        maxMoves,
        status: 'playing',
        shape,
        history: [[]],
        playedColors: [],
        seed,
        boardColors: action.colors,
        boardSize: action.size,
      };
    }
    case 'move': {
      if (!state || state.status !== 'playing') return state;
      if (action.color === state.grid[0][0]) return state; // same as current flood color
      let newGrid: number[][];
      let isWin: boolean;
      switch (state.shape) {
        case 'wheel':
          newGrid = floodWheel(state.grid, action.color);
          isWin = checkWheelWin(newGrid);
          break;
        case 'classic':
          newGrid = floodSolo(state.grid, action.color);
          isWin = checkSoloWin(newGrid);
          break;
        default:
          return assertNever(state.shape);
      }
      const newMoves = state.moves + 1;
      const isLoss = !isWin && newMoves >= state.maxMoves;
      return {
        ...state,
        grid: newGrid,
        moves: newMoves,
        status: isWin ? 'won' : isLoss ? 'lost' : 'playing',
        history: [...state.history, buildMoveDiff(state.grid, newGrid)],
        playedColors: [...state.playedColors, action.color],
      };
    }
    case 'undo': {
      // Only during active play: undoing past a recorded win/loss would
      // double-fire the end-of-game presentation and skew stats.
      if (!state || state.status !== 'playing' || state.history.length <= 1) return state;
      const diff = state.history[state.history.length - 1];
      const grid = state.grid.map((row) => [...row]);
      for (const { r, c, prev } of diff) grid[r][c] = prev;
      return {
        ...state,
        grid,
        moves: state.moves - 1,
        history: state.history.slice(0, -1),
        playedColors: state.playedColors.slice(0, -1),
      };
    }
  }
};

export interface SoloGameOptions {
  /** P7.3: the finished state carries shape/size/config for shape-aware records. */
  onWin?: (final: SoloGameState) => void;
  /** P6.2: same final state for the stats screen. */
  onLose?: (final: SoloGameState) => void;
}

/**
 * P4.4: the reducer's lazy initializer builds the first board during the
 * initial render — the old App re-created the game in an effect whenever
 * `gridSize/colorCount` changed (wiping games in progress). Re-creations now
 * happen only through explicit handlers (new game, settings changes).
 */
export function useSoloGame(
  opts: SoloGameOptions = {},
  initial: { size: GridSize; colors: ColorCount; shape: BoardShape },
) {
  const [soloState, dispatch] = useReducer(soloReducer, null, () =>
    soloReducer(null, {
      type: 'init',
      size: initial.size,
      colors: initial.colors,
      shape: initial.shape,
    }),
  );
  const [highScores, setHighScores] = useState<HighScore[]>(() => loadHighScores());

  // Callbacks are read through refs so the once-per-transition effect below
  // never resurrects stale closures. The ref write lives inside the effect
  // (react-hooks/refs forbids render-phase ref access) and the transition
  // logic consumes the fresh value on the same flush.
  const optsRef = useRef(opts);
  const onEndStatus = useRef<SoloGameState['status'] | null>(null);

  useEffect(() => {
    optsRef.current = opts;
    if (!soloState) return;
    if (soloState.status === onEndStatus.current) return;
    if (soloState.status === 'playing') {
      onEndStatus.current = 'playing';
      return;
    }
    onEndStatus.current = soloState.status;
    if (soloState.status === 'won') {
      optsRef.current.onWin?.(soloState);
    } else if (soloState.status === 'lost') {
      optsRef.current.onLose?.(soloState);
    }
  });

  const init = useCallback(
    (size: GridSize, colors: ColorCount, seed?: number, shape?: BoardShape) =>
      dispatch({ type: 'init', size, colors, seed, shape }),
    [],
  );
  const move = useCallback((color: number) => dispatch({ type: 'move', color }), []);

  // P5.6: one-step solo undo (U key / Undo button).
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const canUndo =
    !!soloState && soloState.status === 'playing' && soloState.history.length > 1;

  const recordWin = useCallback(
    (shape: BoardShape, size: GridSize, colors: ColorCount, moves: number) => {
      setHighScores((prev) => {
        const next = upsertHighScore(prev, shape, size, colors, moves);
        if (next !== prev) saveJson('high-scores', next);
        return next;
      });
    },
    [],
  );

  const currentBest = useCallback(
    (shape: BoardShape, size: GridSize, colors: ColorCount): number | null =>
      highScores.find((s) => s.shape === shape && s.size === size && s.colors === colors)
        ?.moves ?? null,
    [highScores],
  );

  const isPlaying = !!soloState && soloState.status === 'playing';

  return {
    soloState,
    highScores,
    init,
    move,
    undo,
    canUndo,
    recordWin,
    currentBest,
    isPlaying,
  };
}
