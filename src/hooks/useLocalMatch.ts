import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import type {
  TwoPlayerGameState,
  BotDifficulty,
  ColorCount,
  ChallengeType,
  GridSize,
  SeriesScore,
  PlayerId,
  BoardShape,
} from '../types';
import {
  cellCountOf,
  checkGameOverForShape,
  expandTerritoryForShape,
  generateBoardForShape,
} from '../utils/floodLogic';
import { PROGRESSIVE_STAGES } from '../utils/themes';
import { requestBotMove } from '../utils/botWorkerClient';
import { loadJson, saveJson } from '../utils/storage';
import { z } from 'zod';

/**
 * P4.3: local pass-and-play / vs-bot matches as a `useReducer` state machine.
 *
 * The reducer is pure: `init_round` builds a fresh board, `move` applies one
 * territory expansion + the outcome check by calling the shared engine again
 * (deterministic & pure, ~µs per call — see ROADMAP ledger note). `move()`
 * computes the SAME outcome *before* dispatching so side-effect callbacks
 * (confetti, emotes, move sound) fire synchronously exactly like the
 * pre-refactor flow did.
 *
 * Series score lives here too (P4.5 persisted '2p-series', legacy migrated).
 */

const SeriesScoreSchema = z.object({
  p1: z.number().int().min(0).max(999999),
  p2: z.number().int().min(0).max(999999),
  draws: z.number().int().min(0).max(999999),
});

export const loadSeriesScore = (): SeriesScore =>
  loadJson('2p-series', SeriesScoreSchema, 'color-flood-2p-series') ?? {
    p1: 0,
    p2: 0,
    draws: 0,
  };

const saveSeriesScore = (s: SeriesScore) => saveJson('2p-series', s);

/** Active color count for a round (progressive ladder uses the stage config). */
const activeColorCountOf = (s: TwoPlayerGameState, fallbackColors: number): number =>
  s.challengeType === 'progressive'
    ? PROGRESSIVE_STAGES[s.currentStage - 1]?.colorCount || 4
    : fallbackColors;

const centerWins = (
  type: ChallengeType,
  stage: number,
): { size: number; colors: number } => {
  if (type === 'progressive') {
    const stageConfig = PROGRESSIVE_STAGES[stage - 1] || PROGRESSIVE_STAGES[0];
    return { size: stageConfig.gridSize, colors: stageConfig.colorCount };
  }
  return { size: 0, colors: 0 };
};

// --- Reducer -----------------------------------------------------------------

type LocalAction =
  | {
      type: 'init_round';
      size: number;
      colors: number;
      startTurn: PlayerId;
      round: number;
      stage: number;
      stageWins: { 1: number[]; 2: number[] };
      challengeType: ChallengeType;
      shape: BoardShape;
    }
  | { type: 'move'; color: number; colors: number }
  | { type: 'reset_meta' };

const EMPTY_STAGE_WINS: { 1: number[]; 2: number[] } = { 1: [], 2: [] };

const buildFreshRound = (action: {
  size: number;
  colors: number;
  startTurn: PlayerId;
  round: number;
  stage: number;
  stageWins: { 1: number[]; 2: number[] };
  challengeType: ChallengeType;
  shape: BoardShape;
}): TwoPlayerGameState => {
  const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateBoardForShape(
    action.shape,
    action.size,
    action.colors,
  );
  return {
    grid,
    shape: action.shape,
    turn: action.startTurn,
    p1Cells,
    p2Cells,
    p1Color,
    p2Color,
    movesCount: 0,
    status: 'playing',
    p1Moves: 0,
    p2Moves: 0,
    lastGains: { 1: 0, 2: 0 },
    roundNumber: action.round,
    firstTurnPlayer: action.startTurn,
    challengeType: action.challengeType,
    currentStage: action.stage,
    stageWins: action.stageWins,
    resetProposal: null,
  };
};

const localReducer = (
  state: TwoPlayerGameState | null,
  action: LocalAction,
): TwoPlayerGameState | null => {
  switch (action.type) {
    case 'init_round':
      return buildFreshRound(action);

    case 'move': {
      if (!state || state.status !== 'playing') return state;
      // Occupied colors are illegal for the mover (same rule as pre-refactor).
      if (action.color === state.p1Color || action.color === state.p2Color) return state;

      const turn = state.turn;
      const currentCells = turn === 1 ? state.p1Cells : state.p2Cells;
      const opponentCells = turn === 1 ? state.p2Cells : state.p1Cells;
      const { newGrid, newCells, gain } = expandTerritoryForShape(
        state.shape,
        state.grid,
        currentCells,
        opponentCells,
        action.color,
      );

      const nextP1Cells = turn === 1 ? newCells : state.p1Cells;
      const nextP2Cells = turn === 2 ? newCells : state.p2Cells;
      const nextP1Color = turn === 1 ? action.color : state.p1Color;
      const nextP2Color = turn === 2 ? action.color : state.p2Color;

      const outcome = checkGameOverForShape(
        state.shape,
        newGrid,
        nextP1Cells,
        nextP2Cells,
        action.colors,
        nextP1Color,
        nextP2Color,
      );

      const nextStageWins = { 1: [...state.stageWins[1]], 2: [...state.stageWins[2]] };
      if (outcome !== 'playing' && state.challengeType === 'progressive') {
        if (outcome === 'p1_won' && !nextStageWins[1].includes(state.currentStage)) {
          nextStageWins[1].push(state.currentStage);
        } else if (
          outcome === 'p2_won' &&
          !nextStageWins[2].includes(state.currentStage)
        ) {
          nextStageWins[2].push(state.currentStage);
        }
      }

      return {
        ...state,
        grid: newGrid,
        turn: turn === 1 ? 2 : 1,
        p1Cells: nextP1Cells,
        p2Cells: nextP2Cells,
        p1Color: nextP1Color,
        p2Color: nextP2Color,
        movesCount: state.movesCount + 1,
        p1Moves: turn === 1 ? state.p1Moves + 1 : state.p1Moves,
        p2Moves: turn === 2 ? state.p2Moves + 1 : state.p2Moves,
        status: outcome,
        stageWins: nextStageWins,
        lastGains: { ...state.lastGains, [turn]: gain },
      };
    }

    case 'reset_meta': {
      // Clear the ledger + ladder trackers; the live board stays put.
      if (!state) return state;
      return {
        ...state,
        roundNumber: 1,
        firstTurnPlayer: 1,
        currentStage: 1,
        stageWins: { 1: [], 2: [] },
      };
    }
  }
};

// --- Hook --------------------------------------------------------------------

export interface LocalMatchOptions {
  challengeType: ChallengeType;
  colorCount: ColorCount;
  gridSize: GridSize;
  /** P9: topology of newly created rounds (classic square or polar wheel). */
  boardShape: BoardShape;
  /** vs-bot play: automates P2 turns. */
  botEnabled: boolean;
  botDifficulty: BotDifficulty;
  /** Fires once per accepted move, player or bot, AFTER the legality gate. */
  onMoveStart?: (turn: PlayerId, color?: number) => void;
  /** A locally played round reached a decisive outcome ('draw' included). */
  onRoundEnd?: (outcome: TwoPlayerGameState['status'], activeColorCount: number) => void;
  /** Bot reactions to big gains (vs-bot only; presentation lives in the VM). */
  onEmoteOpportunity?: (sender: PlayerId, emoji: string) => void;
}

export interface LocalMatch {
  state: TwoPlayerGameState | null;
  seriesScore: SeriesScore;
  isBotThinking: boolean;
  move: (color: number) => void;
  initRound: (args: {
    size?: number;
    colors?: number;
    startTurn?: PlayerId;
    round?: number;
    stage?: number;
    stageWins?: { 1: number[]; 2: number[] };
    challengeTypeOverride?: ChallengeType;
    shape?: BoardShape;
  }) => void;
  advanceRound: (nextStageOverride?: number) => void;
  resetSeries: () => void;
}

export function useLocalMatch(
  opts: LocalMatchOptions,
  initial: {
    challengeType: ChallengeType;
    colorCount: ColorCount;
    gridSize: GridSize;
    shape: BoardShape;
  },
): LocalMatch {
  const { botEnabled, botDifficulty, colorCount } = opts;
  const [state, dispatch] = useReducer(localReducer, null, () => {
    // Lazy initial round (P4.4: no re-creating effect — the board is built once
    // during the first render and explicit handlers re-create it on paper).
    const startStage = PROGRESSIVE_STAGES[0] || { gridSize: 10, colorCount: 4 };
    if (initial.challengeType === 'progressive') {
      return buildFreshRound({
        size: startStage.gridSize,
        colors: startStage.colorCount,
        startTurn: 1,
        round: 1,
        stage: 1,
        stageWins: EMPTY_STAGE_WINS,
        challengeType: 'progressive',
        shape: initial.shape,
      });
    }
    // Non-progressive local match honors the player's chosen board.
    return buildFreshRound({
      size: initial.gridSize,
      colors: initial.colorCount,
      startTurn: 1,
      round: 1,
      stage: 1,
      stageWins: EMPTY_STAGE_WINS,
      challengeType: initial.challengeType,
      shape: initial.shape,
    });
  });

  const [seriesScore, setSeriesScore] = useState<SeriesScore>(() => loadSeriesScore());
  const [isBotThinking, setIsBotThinking] = useState(false);

  const stateRef = useRef<TwoPlayerGameState | null>(state);
  const optsRef = useRef(opts);
  const moveRef = useRef<LocalMatch['move']>(() => {});

  const initRound: LocalMatch['initRound'] = useCallback((args) => {
    const o = optsRef.current;
    const type = args.challengeTypeOverride ?? o.challengeType;
    const stage = args.stage ?? 1;
    const center = type === 'progressive' ? centerWins(type, stage) : null;
    dispatch({
      type: 'init_round',
      size: args.size ?? center?.size ?? o.gridSize,
      colors: args.colors ?? center?.colors ?? o.colorCount,
      startTurn: args.startTurn ?? 1,
      round: args.round ?? 1,
      stage,
      stageWins: args.stageWins ?? { 1: [], 2: [] },
      challengeType: type,
      shape: args.shape ?? o.boardShape,
    });
    o.onMoveStart?.(args.startTurn ?? 1);
  }, []);

  const advanceRound: LocalMatch['advanceRound'] = useCallback((nextStageOverride?) => {
    const s = stateRef.current;
    if (!s) return;
    const o = optsRef.current;
    const nextRound = s.roundNumber + 1;
    // Strictly alternate first turn.
    const nextFirst: PlayerId = s.firstTurnPlayer === 1 ? 2 : 1;
    if (s.challengeType === 'progressive') {
      const targetStage =
        nextStageOverride !== undefined
          ? nextStageOverride
          : Math.min(5, s.currentStage + 1);
      const stageConfig = PROGRESSIVE_STAGES[targetStage - 1] || PROGRESSIVE_STAGES[0];
      dispatch({
        type: 'init_round',
        size: stageConfig.gridSize,
        colors: stageConfig.colorCount,
        startTurn: nextFirst,
        round: nextRound,
        stage: targetStage,
        stageWins: s.stageWins,
        challengeType: s.challengeType,
        shape: o.boardShape,
      });
    } else {
      dispatch({
        type: 'init_round',
        size: o.gridSize,
        colors: o.colorCount,
        startTurn: nextFirst,
        round: nextRound,
        stage: s.currentStage,
        stageWins: s.stageWins,
        challengeType: s.challengeType,
        shape: o.boardShape,
      });
    }
    o.onMoveStart?.(nextFirst);
  }, []);

  const resetSeries = useCallback(() => {
    const cleared: SeriesScore = { p1: 0, p2: 0, draws: 0 };
    setSeriesScore(cleared);
    saveSeriesScore(cleared);
    dispatch({ type: 'reset_meta' });
  }, []);

  const move = useCallback(
    (color: number) => {
      const s = stateRef.current;
      if (!s || s.status !== 'playing') return;
      // Occupied colors are illegal regardless of whose turn it is (pre-refactor rule).
      if (color === s.p1Color || color === s.p2Color) return;
      const turn = s.turn;
      const colors = activeColorCountOf(s, optsRef.current.colorCount);

      // Pre-dispatch outcome for synchronous callbacks; the reducer re-runs the
      // same pure engine call when it transforms the state (see header docs).
      const currentCells = turn === 1 ? s.p1Cells : s.p2Cells;
      const opponentCells = turn === 1 ? s.p2Cells : s.p1Cells;
      const { newCells, gain } = expandTerritoryForShape(
        s.shape,
        s.grid,
        currentCells,
        opponentCells,
        color,
      );
      const nextP1Cells = turn === 1 ? newCells : s.p1Cells;
      const nextP2Cells = turn === 2 ? newCells : s.p2Cells;
      const nextP1Color = turn === 1 ? color : s.p1Color;
      const nextP2Color = turn === 2 ? color : s.p2Color;
      const totalCells = cellCountOf(s.grid);
      const outcome = checkGameOverForShape(
        s.shape,
        s.grid,
        nextP1Cells,
        nextP2Cells,
        colors,
        nextP1Color,
        nextP2Color,
      );

      optsRef.current.onMoveStart?.(turn, color);

      if (outcome !== 'playing') {
        optsRef.current.onRoundEnd?.(outcome, colors);
        // Series ledger updates once per decisive round (same as pre-refactor).
        setSeriesScore((prev) => {
          const updated: SeriesScore =
            outcome === 'p1_won'
              ? { ...prev, p1: prev.p1 + 1 }
              : outcome === 'p2_won'
                ? { ...prev, p2: prev.p2 + 1 }
                : { ...prev, draws: prev.draws + 1 };
          saveSeriesScore(updated);
          return updated;
        });
      } else if (optsRef.current.botEnabled) {
        // Bot reacts to big gains on either side (same thresholds as pre-refactor).
        if (turn === 1 && gain >= Math.max(5, Math.floor(totalCells * 0.08))) {
          setTimeout(() => {
            optsRef.current.onEmoteOpportunity?.(
              2,
              Math.random() < 0.4 ? '😭' : Math.random() < 0.5 ? '😮' : '💀',
            );
          }, 350);
        } else if (turn === 2 && gain >= Math.max(4, Math.floor(totalCells * 0.07))) {
          setTimeout(() => {
            optsRef.current.onEmoteOpportunity?.(2, Math.random() < 0.5 ? '😎' : '🔥');
          }, 350);
        }
      }

      dispatch({ type: 'move', color, colors });
      // Refs & dispatch are stable; the compiler's inferred deps are listed
      // explicitly so manual memoization can be preserved.
    },
    [dispatch, stateRef, optsRef, setSeriesScore],
  );

  // Ref writes belong in effects (react-hooks/refs): the order below matters —
  // this runs before the bot effect on every flush, so the bot effect always
  // reads the freshest state/opts/move.
  useEffect(() => {
    stateRef.current = state;
    optsRef.current = opts;
    moveRef.current = move;
  });

  // --- Bot Turn Automation (P2.7 worker; same 420 ms pacing & stale guards) ---
  useEffect(() => {
    const s = stateRef.current;
    if (!botEnabled || !s || s.status !== 'playing' || s.turn !== 2) {
      setIsBotThinking(false);
      return;
    }

    setIsBotThinking(true);
    let cancelled = false;

    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.status !== 'playing' || current.turn !== 2) {
        setIsBotThinking(false);
        return;
      }

      requestBotMove({
        grid: current.grid,
        activePlayer: 2,
        p1Cells: current.p1Cells,
        p2Cells: current.p2Cells,
        p1Color: current.p1Color,
        p2Color: current.p2Color,
        colorCount: activeColorCountOf(current, colorCount),
        difficulty: botDifficulty,
        shape: current.shape,
      }).then((bestColor) => {
        if (cancelled) return;
        // Stale response (state changed while the worker computed) is dropped.
        if (
          stateRef.current !== current ||
          current.status !== 'playing' ||
          current.turn !== 2
        ) {
          setIsBotThinking(false);
          return;
        }
        setIsBotThinking(false);
        moveRef.current(bestColor);
      });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, botEnabled, botDifficulty, colorCount]);

  return {
    state,
    seriesScore,
    isBotThinking,
    move,
    initRound,
    advanceRound,
    resetSeries,
  };
}
