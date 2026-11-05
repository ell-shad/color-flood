import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import type { SoloGameState, HighScore, GridSize, ColorCount } from '../types';
import { generateSoloGrid, floodSolo, checkSoloWin } from '../utils/floodLogic';
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
  size: z.number().int().min(5).max(30),
  colors: z.number().int().min(2).max(12),
  moves: z.number().int().min(1).max(9999),
});
const HighScoresSchema = z.array(HighScoreSchema).max(50);

export const loadHighScores = (): HighScore[] =>
  loadJson('high-scores', HighScoresSchema, 'color-flood-high-scores') ?? [];

const updateHighScores = (
  prev: HighScore[],
  size: GridSize,
  colors: ColorCount,
  moves: number,
): HighScore[] => {
  const idx = prev.findIndex((s) => s.size === size && s.colors === colors);
  let next: HighScore[];
  if (idx > -1) {
    if (moves >= prev[idx].moves) return prev;
    next = [...prev];
    next[idx] = { size, colors, moves };
  } else {
    next = [...prev, { size, colors, moves }];
  }
  saveJson('high-scores', next);
  return next;
};

// --- Reducer -----------------------------------------------------------------

type SoloAction =
  { type: 'init'; size: GridSize; colors: ColorCount } | { type: 'move'; color: number };

const soloReducer = (
  state: SoloGameState | null,
  action: SoloAction,
): SoloGameState | null => {
  switch (action.type) {
    case 'init': {
      const grid = generateSoloGrid(action.size, action.colors);
      return {
        grid,
        moves: 0,
        maxMoves: maxSoloMovesLimit(action.size, action.colors),
        status: 'playing',
        history: [grid.map((r) => [...r])],
      };
    }
    case 'move': {
      if (!state || state.status !== 'playing') return state;
      if (action.color === state.grid[0][0]) return state; // same as current flood color
      const newGrid = floodSolo(state.grid, action.color);
      const newMoves = state.moves + 1;
      const isWin = checkSoloWin(newGrid);
      const isLoss = !isWin && newMoves >= state.maxMoves;
      return {
        ...state,
        grid: newGrid,
        moves: newMoves,
        status: isWin ? 'won' : isLoss ? 'lost' : 'playing',
        history: [...state.history, newGrid.map((r) => [...r])],
      };
    }
  }
};

export interface SoloGameOptions {
  onWin?: (moves: number) => void;
  onLose?: () => void;
}

/**
 * P4.4: the reducer's lazy initializer builds the first board during the
 * initial render — the old App re-created the game in an effect whenever
 * `gridSize/colorCount` changed (wiping games in progress). Re-creations now
 * happen only through explicit handlers (new game, settings changes).
 */
export function useSoloGame(
  opts: SoloGameOptions = {},
  initial: { size: GridSize; colors: ColorCount },
) {
  const [soloState, dispatch] = useReducer(soloReducer, null, () =>
    soloReducer(null, { type: 'init', size: initial.size, colors: initial.colors }),
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
      optsRef.current.onWin?.(soloState.moves);
    } else if (soloState.status === 'lost') {
      optsRef.current.onLose?.();
    }
  });

  const init = useCallback(
    (size: GridSize, colors: ColorCount) => dispatch({ type: 'init', size, colors }),
    [],
  );
  const move = useCallback((color: number) => dispatch({ type: 'move', color }), []);

  const recordWin = useCallback((size: GridSize, colors: ColorCount, moves: number) => {
    setHighScores((prev) => updateHighScores(prev, size, colors, moves));
  }, []);

  const currentBest = useCallback(
    (size: GridSize, colors: ColorCount): number | null =>
      highScores.find((s) => s.size === size && s.colors === colors)?.moves ?? null,
    [highScores],
  );

  const isPlaying = !!soloState && soloState.status === 'playing';

  return { soloState, highScores, init, move, recordWin, currentBest, isPlaying };
}
