import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type {
  ActiveEmote,
  BotDifficulty,
  ChallengeType,
  ColorCount,
  GameMode,
  GridSize,
  HighScore,
  MultiplayerOpponent,
  OnlineRoomState,
  PlayerId,
  ResetProposal,
  SeriesScore,
  SoloGameState,
  ThemeId,
  TwoPlayerGameState,
} from '../types';
import { THEMES, PROGRESSIVE_STAGES } from '../utils/themes';
import { getBestMultiplayerMove, getBestSoloMove } from '../utils/floodLogic';
import {
  playEmotePopSound,
  playLoseSound,
  playMoveSound,
  playWinSound,
} from '../utils/soundEffects';
import { loadStoredSession, useOnlineMultiplayer } from '../utils/useOnlineMultiplayer';
import { loadStringOr } from '../utils/storage';
import { prefersReducedMotionSnapshot } from '../utils/motionPreferences';
import {
  applyDailyWin,
  buildDailyShareText,
  dailyDateString,
  dailySetupFor,
  loadDailyStreak,
  saveDailyStreak,
  type DailyStreak,
} from '../utils/daily';
import { hapticLose, hapticMove, hapticTurn, hapticWin } from '../utils/haptics';
import { usePrefs } from './usePrefs';
import { useSoloGame } from './useSoloGame';
import { useLocalMatch } from './useLocalMatch';

/**
 * P4.2: the one game-session view model.
 *
 * Composes preferences (P4.1), the solo state machine (P4.3), the local/bot
 * state machine (P4.3), and the online hook into a single facade. Every
 * `opponent === 'online' && roomState ? … : …` ternary that used to be spread
 * across App.tsx JSX is resolved here exactly once: online rooms are coerced
 * into the same `TwoPlayerGameState` shape as local matches, and presentation
 * (confetti/sounds/emotes/hints) is wired to the state machines' callbacks.
 *
 * P4.4: no init effect re-creates the games — the reducers build their first
 * boards lazily during the initial render, and only explicit handlers below
 * ever swap in a fresh board.
 */

const coerceRoom = (room: OnlineRoomState): TwoPlayerGameState | null => {
  // A 'waiting' room renders as the lobby, never as a match.
  if (room.status === 'waiting') return null;
  return {
    ...room,
    // The spread keeps the declared (un-narrowed) status union; re-assign the
    // narrowed property so 'waiting' cannot leak into a live match.
    status: room.status,
    roundNumber: room.roundNumber || 1,
    firstTurnPlayer: room.firstTurnPlayer || 1,
    challengeType: room.challengeType || 'standard',
    currentStage: room.currentStage || 1,
    stageWins: room.stageWins || { 1: [], 2: [] },
    resetProposal: room.resetProposal || null,
  };
};

const matchColorCountOf = (m: TwoPlayerGameState, fallback: number): number =>
  m.challengeType === 'progressive'
    ? PROGRESSIVE_STAGES[m.currentStage - 1]?.colorCount || 4
    : fallback;

const matchGridSizeOf = (m: TwoPlayerGameState, fallback: number): number =>
  m.challengeType === 'progressive'
    ? PROGRESSIVE_STAGES[m.currentStage - 1]?.gridSize || 10
    : fallback;

const BOT_NAMES = { p1: 'Player 1', p2: 'AI Bot' } as const;
const LOCAL_NAMES = { p1: 'Player 1', p2: 'Player 2' } as const;

export interface GameSession {
  // --- Preferences (P4.1) ---
  mode: GameMode;
  gridSize: GridSize;
  colorCount: ColorCount;
  botDifficulty: BotDifficulty;
  challengeType: ChallengeType;
  opponent: MultiplayerOpponent;
  showTerritoryOverlay: boolean;
  setShowTerritoryOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  /** P5.4: digit overlay on cells (color-blind aid), local-only pref. */
  showColorSymbols: boolean;
  setShowColorSymbols: React.Dispatch<React.SetStateAction<boolean>>;
  showHints: boolean;
  setShowHints: React.Dispatch<React.SetStateAction<boolean>>;
  soundMuted: boolean;
  toggleSound: () => void;
  /** The theme actually displayed: the room's theme wins while in a room. */
  themeId: ThemeId;
  setThemeId: (t: ThemeId) => void;
  currentTheme: (typeof THEMES)[ThemeId];

  // --- Online (raw passthrough for lobby / modal wiring) ---
  roomState: OnlineRoomState | null;
  myRole: 1 | 2 | null;
  connectionStatus: string;
  onlineError: string | null;
  onlineSystemMessage: string | null;
  isMyTurn: boolean;
  createOnlineRoom: ReturnType<typeof useOnlineMultiplayer>['createRoom'];
  joinOnlineRoom: ReturnType<typeof useOnlineMultiplayer>['joinRoom'];
  leaveOnlineRoom: () => void;
  clearOnlineError: () => void;
  updateOnlineSettings: ReturnType<typeof useOnlineMultiplayer>['updateRoomSettings'];
  acceptOnlineRematch: () => void;
  declineOnlineRematch: () => void;

  // --- Unified match state (P4.2) ---
  soloState: SoloGameState | null;
  localState: TwoPlayerGameState | null;
  /** The match actually on screen: coerced online room or the local machine. */
  activeMatch: TwoPlayerGameState | null;
  matchGridSize: number;
  matchColorCount: number;
  matchSeries: SeriesScore;
  matchChallengeType: ChallengeType;
  matchStage: number;
  /** Concrete player names for UI that always needs a label. */
  playerNames: { p1: string; p2: string };
  /** Player names / room details that only exist online (spread into props). */
  onlineOnly: {
    p1Name?: string;
    p2Name?: string | null;
    roomId?: string;
    p1Connected?: boolean;
    p2Connected?: boolean;
  };
  isOnlineLobbyActive: boolean;
  activeOnlineProposal: ResetProposal | null;
  highScores: HighScore[];
  currentHighScore: number | null;
  isBotThinking: boolean;
  lastMovingPlayer: PlayerId;

  // --- Derived view props (kill the JSX ternaries) ---
  /** Hints toggle visibility: online play never shows the hint button. */
  showHintButton: boolean;
  paletteColorCount: number;
  paletteDisabled: boolean;
  emoteBarDisabled: boolean;
  activeTurn: PlayerId;
  gridView: { grid: number[][]; gridSize: number; p1Cells: string[]; p2Cells: string[] };
  /** Move counter for the board pop animation (P4.6 parity trick). */
  gridMovesCount: number;
  totalCells: number;
  matchStatus: 'playing' | 'p1_won' | 'p2_won' | 'draw';
  rematchRequestedBy: number | null;

  // --- Hint system ---
  hint: number | null;
  hintGain: number | undefined;
  soloHintsLeft: number;
  getHint: () => void;

  // --- Solo undo (P5.2 U key / P5.6 diff-based history) ---
  undoSolo: () => void;
  canUndoSolo: boolean;

  // --- Screen-reader announcements (P5.3) ---
  /** Rendered into an aria-live="polite" region by App. */
  announce: string;

  // --- Daily Challenge (P6.1) ---
  dailyActive: boolean;
  /** Date string of the active round (null = normal solo). */
  dailyDate: string | null;
  /** Per-device streak / best (read from versioned storage). */
  dailyStreak: DailyStreak;
  /** Starts today's date-seeded solo board (size/colors from the date). */
  startDailyChallenge: () => void;
  /** Spoiler-safe share sheet; null when no daily result exists. */
  dailyShareText: string | null;

  // --- Emote system ---
  activeEmotes: ActiveEmote[];
  triggerEmote: (sender: PlayerId, emoji: string, broadcastOnline?: boolean) => void;

  // --- Actions ---
  /** Raw opponent setter: the settings panel keeps the no-reinit behavior. */
  setOpponent: (o: MultiplayerOpponent) => void;
  pickColor: (color: number) => void;
  /** Solo-only: fresh board for the current prefs. */
  newSoloGame: () => void;
  /** Header reset button / scoreboard request (mode-aware). */
  initiateReset: () => void;
  /** GameOverModal "play again" (mode-aware). */
  playAgain: () => void;
  /** Local/bot: advance to the next round (progressive ladder aware). */
  advanceLocalMatchRound: (nextStageOverride?: number) => void;
  resetSeries: () => void;
  handleSetToEasiest: () => void;
  handleChangeGridSize: (size: GridSize) => void;
  handleChangeColorCount: (count: ColorCount) => void;
  handleChangeChallengeType: (type: ChallengeType) => void;
  handleSetBotDifficulty: (d: BotDifficulty) => void;
  handleSelectMode: (m: GameMode) => void;
  handleChangeOpponent: (o: MultiplayerOpponent) => void;
  handleChangeTurnTimer: (sec: 0 | 30 | 60) => void;
  /** Theme modal pick: sets the local theme and mirrors it into the room. */
  handleSelectTheme: (id: ThemeId) => void;
  /** Host-only per-turn timer editing (online). */
  turnTimerEditable: boolean;

  // --- Local reset confirmation modal ---
  showLocalResetConfirm: boolean;
  confirmLocalReset: () => void;
  cancelLocalReset: () => void;
}

export function useGameSession(): GameSession {
  const prefs = usePrefs();

  // --- Online Multiplayer Hook ---
  const {
    roomState,
    myRole,
    connectionStatus,
    systemMessage: onlineSystemMessage,
    errorMessage: onlineError,
    isMyTurn,
    createRoom,
    joinRoom,
    makeMove: sendOnlineMove,
    proposeReset: proposeOnlineReset,
    acceptReset: acceptOnlineReset,
    declineReset: declineOnlineReset,
    updateRoomSettings,
    leaveRoom,
    setErrorMessage,
    sendOnlineEmote,
    setOnEmoteCallback,
  } = useOnlineMultiplayer();

  // --- Local / bot machine (destructured for stable dep names) ---
  const {
    state: localState,
    seriesScore,
    isBotThinking,
    move: makeLocalMove,
    initRound,
    advanceRound,
    resetSeries,
  } = useLocalMatch(
    {
      challengeType: prefs.challengeType,
      colorCount: prefs.colorCount,
      gridSize: prefs.gridSize,
      botEnabled: prefs.opponent === 'bot',
      botDifficulty: prefs.botDifficulty,
      onMoveStart: (turn, color) => {
        setLastMovingPlayer(turn);
        if (color !== undefined) {
          playMoveSound(color);
          hapticMove(prefs.soundMuted); // P5.7
        }
        clearHint();
        // P5.7: your turn arrived in an online match (opponent just moved).
        if (prefs.opponent === 'online' && turn !== myRole) {
          hapticTurn(prefs.soundMuted);
        }
      },
      onRoundEnd: (outcome, colors) => {
        if (outcome !== 'draw') {
          // P5.7: haptic on the round result.
          hapticWin(prefs.soundMuted);
          // P5.5: the OS reduce-motion setting skips the burst; sound stays.
          if (!prefersReducedMotionSnapshot()) {
            confetti({
              particleCount: 180,
              spread: 90,
              origin: { y: 0.55 },
              colors: currentTheme.colors.slice(0, colors),
            });
          }
          playWinSound();
        }
      },
      onEmoteOpportunity: (sender, emoji) =>
        triggerEmoteRef.current?.(sender, emoji, false),
    },
    {
      challengeType: prefs.challengeType,
      colorCount: prefs.colorCount,
      gridSize: prefs.gridSize,
    },
  );

  // --- Solo machine (actions are stable hook callbacks; keep their names) ---
  const {
    soloState,
    highScores,
    init: initSoloBoard,
    move: makeSoloMove,
    undo: undoSoloBoard,
    canUndo: canUndoSolo,
    recordWin: recordSoloWin,
  } = useSoloGame(
    {
      onWin: (moves) => {
        // P5.5: the OS reduce-motion setting skips the burst; sound stays.
        hapticWin(prefs.soundMuted); // P5.7
        if (!prefersReducedMotionSnapshot()) {
          confetti({
            particleCount: 160,
            spread: 80,
            origin: { y: 0.6 },
            colors: currentTheme.colors.slice(
              0,
              dailyRoundRef.current?.colors ?? prefs.colorCount,
            ),
          });
        }
        playWinSound(); // fires for every solo win; daily rounds additionally score a streak below
        // P6.1: daily rounds update the streak once per date; their seeded
        // boards are excluded from the per-config high-score tables (the
        // round config can differ from prefs, and replays shouldn't farm stars).
        recordDailyWin();
        if (!dailyRoundRef.current) {
          recordSoloWinRef.current?.(prefs.gridSize, prefs.colorCount, moves);
        }
      },
      onLose: () => {
        hapticLose(prefs.soundMuted); // P5.7
        playLoseSound();
      },
    },
    // P4.4: the first board is built lazily during this initial render.
    { size: prefs.gridSize, colors: prefs.colorCount },
  );

  // --- Presentation state owned by the facade ---
  const [hint, setHint] = useState<number | null>(null);
  const [hintGain, setHintGain] = useState<number | undefined>(undefined);
  const [soloHintsLeft, setSoloHintsLeft] = useState(3);
  const [lastMovingPlayerState, setLastMovingPlayer] = useState<PlayerId>(1);
  const [activeEmotes, setActiveEmotes] = useState<ActiveEmote[]>([]);
  const [showLocalResetConfirm, setShowLocalResetConfirm] = useState(false);

  const clearHint = useCallback(() => {
    setHint(null);
    setHintGain(undefined);
  }, [setHint, setHintGain]);

  // --- P6.1: Daily Challenge round -------------------------------------------
  // A daily round is a solo game flagged with its date + date-derived config;
  // the board itself is seeded in the solo machine via mulberry32.
  interface DailyRound {
    date: string;
    size: GridSize;
    colors: ColorCount;
    seed: number;
  }
  const [dailyRound, setDailyRound] = useState<DailyRound | null>(null);
  const [dailyStreakState, setDailyStreakState] = useState<DailyStreak>(() => loadDailyStreak());

  /** Today's date + config + seed (stable transform helpers). */
  const dailySetup = useCallback(() => {
    const date = dailyDateString();
    return { date, ...dailySetupFor(date) };
  }, []);

  /** Starts (or restarts, via undo/seed) today's date-seeded board. */
  const startDailyChallenge = useCallback(() => {
    const setup = dailySetup();
    initSoloBoard(setup.size, setup.colors, setup.seed);
    setSoloHintsLeft(3);
    setHint(null);
    setHintGain(undefined);
    setDailyRound({ date: setup.date, size: setup.size, colors: setup.colors, seed: setup.seed });
  }, [dailySetup, initSoloBoard, setSoloHintsLeft, setHint, setHintGain, setDailyRound]);

  /** Scores a daily win once per date (streak + storage, safe re-entry). */
  // The round (and its date) is read through a ref so the win scoring has no
  // render-phase side effects; onWin fires once per recorded outcome, and
  // applyDailyWin stays idempotent per date as a second guard.
  const dailyRoundRef = useRef<DailyRound | null>(null);
  useEffect(() => {
    dailyRoundRef.current = dailyRound;
  });
  const recordDailyWin = useCallback(() => {
    const round = dailyRoundRef.current;
    if (!round || round.date !== dailyDateString()) return;
    const updated = applyDailyWin(loadDailyStreak(), round.date);
    saveDailyStreak(updated);
    setDailyStreakState(updated);
  }, []);

  /** Wordle-style share sheet for the current/last daily round result. */
  const dailyShareText = (() => {
    if (!dailyRound || !soloState || soloState.status === 'playing') return null;
    return buildDailyShareText({
      dateString: dailyRound.date,
      size: dailyRound.size,
      colors: dailyRound.colors,
      moves: soloState.moves,
      maxMoves: soloState.maxMoves,
      playedColors: soloState.playedColors,
      status: soloState.status,
    });
  })();

  // --- Emote Interaction Handler (verbatim from the pre-refactor App) ---
  const triggerEmote = useCallback(
    (sender: PlayerId, emoji: string, broadcastOnline = true) => {
      playEmotePopSound();
      const id = `${Date.now()}-${Math.random()}`;
      const newEmote: ActiveEmote = {
        id,
        sender,
        emoji,
        timestamp: Date.now(),
      };

      setActiveEmotes((prev) => [...prev.slice(-3), newEmote]);

      setTimeout(() => {
        setActiveEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 2200);

      if (broadcastOnline && prefs.opponent === 'online') {
        sendOnlineEmote(emoji);
      }

      if (prefs.opponent === 'bot' && sender === 1) {
        if (Math.random() < 0.6) {
          setTimeout(
            () => {
              const botReactions = ['🤖', '😎', '😂', '🔥', '👏', '🤔', '💀', '😡', '😭'];
              const botPick =
                emoji === '😡'
                  ? Math.random() < 0.5
                    ? '😡'
                    : '😂'
                  : emoji === '😭'
                    ? Math.random() < 0.5
                      ? '😎'
                      : '😭'
                    : botReactions[Math.floor(Math.random() * botReactions.length)];
              playEmotePopSound();
              const botId = `${Date.now()}-${Math.random()}`;
              const botEmote: ActiveEmote = {
                id: botId,
                sender: 2,
                emoji: botPick,
                timestamp: Date.now(),
              };
              setActiveEmotes((prev) => [...prev.slice(-3), botEmote]);
              setTimeout(() => {
                setActiveEmotes((prev) => prev.filter((e) => e.id !== botId));
              }, 2200);
            },
            600 + Math.random() * 450,
          );
        }
      }
    },
    [prefs.opponent, sendOnlineEmote],
  );

  // The local machine's callbacks are registered before the handlers they
  // call exist; these indirections keep them pointing at the latest version.
  const triggerEmoteRef = useRef<typeof triggerEmote | null>(null);
  useEffect(() => {
    triggerEmoteRef.current = triggerEmote;
  });

  // recordWin lives in the solo hook api declared below the solo options
  // object; the indirection lets onWin call it from the transition effect.
  const recordSoloWinRef = useRef<ReturnType<typeof useSoloGame>['recordWin'] | null>(
    null,
  );
  useEffect(() => {
    recordSoloWinRef.current = recordSoloWin;
  });

  useEffect(() => {
    setOnEmoteCallback((role, emoji) => {
      triggerEmoteRef.current?.(role, emoji, false);
    });
  }, [setOnEmoteCallback]);

  // P3.5: auto-join a shared ?room= link. A stored session for the SAME room
  // wins (the hook auto-resumes it, so a reloading host keeps P1 — P3.7); any
  // other stored session means the player is already in a match and the URL
  // is ignored rather than yanking them out of it.
  useEffect(() => {
    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (!roomParam) return;
    const code = roomParam.toUpperCase().trim();
    if (loadStoredSession()) return;
    const name = loadStringOr('player-name', 'Player 1', 'color-flood-player-name');
    void joinRoom(code, name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only join (P3.5)
  }, []);

  // --- Derived values ----------------------------------------------------
  const onlineActive = prefs.opponent === 'online' && !!roomState;

  // P4.4 note: the room's theme SYNC used to be a setState-in-effect; deriving
  // is behaviorally equivalent (personal theme restores when leaving).
  const themeId =
    roomState?.themeId && roomState.themeId in THEMES
      ? (roomState.themeId as ThemeId)
      : prefs.themeId;
  const currentTheme = THEMES[themeId] || THEMES.arcade;

  // Confetti/sound on Online Game Outcome (restored: dropped during the P4
  // facade rewrite). Runs outside React state — presentation only.
  useEffect(() => {
    if (
      prefs.opponent === 'online' &&
      roomState &&
      roomState.status !== 'playing' &&
      roomState.status !== 'waiting'
    ) {
      if (roomState.status !== 'draw') {
        // P5.5: respect the OS reduce-motion setting (sound is unaffected).
        if (!prefersReducedMotionSnapshot()) {
          confetti({
            particleCount: 160,
            spread: 80,
            origin: { y: 0.55 },
            colors: currentTheme.colors.slice(0, roomState.colorCount),
          });
        }
        // P4.8: praise a win, commiserate a loss (mute is per device).
        const iWon =
          (roomState.status === 'p1_won' && myRole === 1) ||
          (roomState.status === 'p2_won' && myRole === 2);
        if (iWon) {
          hapticWin(prefs.soundMuted); // P5.7
          playWinSound();
        } else if (myRole) {
          hapticLose(prefs.soundMuted); // P5.7
          playLoseSound();
        }
      }
    }
  }, [prefs.opponent, prefs.soundMuted, roomState, currentTheme, myRole]);
  // Online last-mover used to be a setState-in-effect mirror of room.turn:
  // deriving it is the same value with zero cascading renders.
  const onlineLastMover = roomState ? (roomState.turn === 1 ? 2 : 1) : null;
  const lastMovingPlayer =
    onlineActive && onlineLastMover !== null ? onlineLastMover : lastMovingPlayerState;

  const activeMatch: TwoPlayerGameState | null =
    onlineActive && roomState ? coerceRoom(roomState) : localState;

  const inMatch = prefs.mode === 'multiplayer' && activeMatch !== null;
  const matchGridSize = inMatch
    ? onlineActive && roomState
      ? roomState.gridSize
      : matchGridSizeOf(activeMatch!, prefs.gridSize)
    : prefs.gridSize;
  const matchColorCount = inMatch
    ? onlineActive && roomState
      ? roomState.colorCount
      : matchColorCountOf(activeMatch!, prefs.colorCount)
    : prefs.colorCount;
  const matchSeries = onlineActive && roomState ? roomState.series : seriesScore;
  const matchChallengeType = inMatch
    ? onlineActive && roomState
      ? roomState.challengeType || 'standard'
      : activeMatch!.challengeType
    : prefs.challengeType;
  const matchStage = inMatch
    ? onlineActive && roomState
      ? roomState.currentStage || 1
      : activeMatch!.currentStage
    : 1;

  const playerNames =
    onlineActive && roomState
      ? { p1: roomState.p1Name, p2: roomState.p2Name || 'Player 2' }
      : prefs.opponent === 'bot'
        ? BOT_NAMES
        : LOCAL_NAMES;

  const onlineOnly = onlineActive
    ? {
        p1Name: roomState!.p1Name,
        p2Name: roomState!.p2Name,
        roomId: roomState!.roomId,
        p1Connected: roomState!.p1Connected,
        p2Connected: roomState!.p2Connected,
      }
    : {
        p1Name: undefined,
        p2Name: undefined,
        roomId: undefined,
        p1Connected: undefined,
        p2Connected: undefined,
      };

  const isOnlineLobbyActive =
    prefs.mode === 'multiplayer' &&
    prefs.opponent === 'online' &&
    (!roomState || roomState.status === 'waiting');

  const activeOnlineProposal =
    onlineActive && roomState?.resetProposal ? roomState.resetProposal : null;

  const currentHighScore =
    highScores.find((s) => s.size === prefs.gridSize && s.colors === prefs.colorCount)
      ?.moves ?? null;

  // --- Derived view props: one place resolves every former JSX ternary ------
  const showHintButton = prefs.opponent === 'online' ? false : prefs.showHints;
  // P6.1: active daily round — non-null solo configs are overridden by the
  // date-seeded round (board size, palette count, share material).
  const dailyPalette =
    prefs.mode === 'solo' && dailyRound ? dailyRound.colors : prefs.colorCount;
  const paletteColorCount = prefs.mode === 'solo' ? dailyPalette : matchColorCount;
  const dailyGridSize =
    prefs.mode === 'solo' && dailyRound ? dailyRound.size : prefs.gridSize;
  const activeTurn = activeMatch?.turn ?? 1;
  const matchStatus = activeMatch?.status ?? 'playing';
  const rematchRequestedBy = roomState?.rematchRequestedBy ?? null;
  const totalCells = (prefs.mode === 'solo' ? prefs.gridSize : matchGridSize) ** 2;
  const gridView = {
    grid: prefs.mode === 'solo' && soloState ? soloState.grid : (activeMatch?.grid ?? []),
    gridSize: prefs.mode === 'solo' ? dailyGridSize : matchGridSize,
    p1Cells: activeMatch?.p1Cells ?? localState?.p1Cells ?? [],
    p2Cells: activeMatch?.p2Cells ?? localState?.p2Cells ?? [],
  };
  const gridMovesCount =
    prefs.mode === 'solo' ? (soloState?.moves ?? 0) : (activeMatch?.movesCount ?? 0);
  const paletteDisabled =
    prefs.mode === 'solo'
      ? !soloState || soloState.status !== 'playing'
      : prefs.opponent === 'online'
        ? !isMyTurn || !roomState || roomState.status !== 'playing'
        : !!localState &&
          (localState.status !== 'playing' ||
            (prefs.opponent === 'bot' && localState.turn === 2));
  const emoteBarDisabled =
    prefs.opponent === 'online'
      ? !roomState || roomState.status !== 'playing'
      : !!localState && localState.status !== 'playing';
  const turnTimerEditable = prefs.opponent === 'online' && myRole === 1;

  // --- P5.3: screen-reader announcements (derived — no cascading renders).
  // Every move increments a counter suffix so polite live regions re-fire
  // even when the message text repeats.
  const announce = (() => {
    if (prefs.mode === 'solo') {
      const s = soloState;
      if (!s) return '';
      if (s.status === 'won') return `You solved the board in ${s.moves} moves!`;
      if (s.status === 'lost') return `Out of moves after ${s.moves} moves. Game over.`;
      return `Move ${s.moves} of ${s.maxMoves}`;
    }
    const m = activeMatch;
    if (!m || prefs.mode !== 'multiplayer') return '';
    if (m.status !== 'playing') {
      if (m.status === 'draw') return 'Round drawn.';
      return `${m.status === 'p1_won' ? playerNames.p1 : playerNames.p2} wins the round.`;
    }
    return `${playerNames[m.turn]} to move — ${m.movesCount} moves played`;
  })();

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  const newSoloGame = useCallback(() => {
    initSoloBoard(prefs.gridSize, prefs.colorCount);
    setSoloHintsLeft(3);
    clearHint();
    setDailyRound(null); // P6.1: leaving the daily board ends its round flag
  }, [initSoloBoard, prefs.gridSize, prefs.colorCount, clearHint, setSoloHintsLeft, setDailyRound]);

  const pickColor = useCallback(
    (color: number) => {
      if (prefs.mode === 'solo') {
        const s = soloState;
        if (!s || s.status !== 'playing') return;
        if (color === s.grid[0][0]) return;
        setLastMovingPlayer(1);
        playMoveSound(color);
        clearHint();
        makeSoloMove(color);
        return;
      }
      if (prefs.opponent === 'online') {
        setLastMovingPlayer(myRole ?? 1);
        playMoveSound(color);
        clearHint();
        sendOnlineMove(color);
        return;
      }
      // Local/bot: sound + lastMover fire via the machine's onMoveStart.
      makeLocalMove(color);
    },
    [
      prefs.mode,
      prefs.opponent,
      soloState,
      makeSoloMove,
      makeLocalMove,
      myRole,
      sendOnlineMove,
      clearHint,
      setLastMovingPlayer,
    ],
  );

  const getHint = useCallback(() => {
    if (prefs.mode === 'solo') {
      const s = soloState;
      if (!s || s.status !== 'playing') return;
      // Limited hints: 3 per solo game. Never free.
      if (soloHintsLeft <= 0) return;
      setSoloHintsLeft((n) => Math.max(0, n - 1));
      setHint(getBestSoloMove(s.grid, prefs.colorCount));
      setHintGain(undefined);
      return;
    }
    if (prefs.opponent === 'online') {
      // Hints are disabled in online play (they would reveal a near-optimal
      // move to both players for free).
      return;
    }
    // Local and bot matches: hints are opt-in and off by default (parity with
    // the pre-refactor handleGetHint).
    if (!prefs.showHints) return;
    if (!localState || localState.status !== 'playing') return;
    const { bestColor, maxGain } = getBestMultiplayerMove(
      localState.grid,
      localState.turn,
      localState.p1Cells,
      localState.p2Cells,
      localState.p1Color,
      localState.p2Color,
      matchColorCountOf(localState, prefs.colorCount),
      'master',
      // Hints run on the main thread: hard cap the search time so the UI
      // never freezes (checked every 256 nodes).
      { deadlineMs: 300, now: () => performance.now() },
    );
    setHint(bestColor);
    setHintGain(maxGain);
  }, [
    prefs.mode,
    prefs.opponent,
    prefs.colorCount,
    prefs.showHints,
    soloHintsLeft,
    soloState,
    localState,
    setHint,
    setHintGain,
    setSoloHintsLeft,
  ]);

  const initiateReset = useCallback(() => {
    if (prefs.mode === 'solo') {
      newSoloGame();
      return;
    }
    if (prefs.opponent === 'online') {
      // Online: reset proposal requiring approval.
      void proposeOnlineReset();
      return;
    }
    if (prefs.opponent === 'local') {
      // Local pass & play: prompt confirmation so accidental taps don't clear board.
      setShowLocalResetConfirm(true);
      return;
    }
    // vs AI Bot: auto-resets and alternates starting player.
    advanceRound();
  }, [
    prefs.mode,
    prefs.opponent,
    advanceRound,
    newSoloGame,
    proposeOnlineReset,
    setShowLocalResetConfirm,
  ]);

  const playAgain = useCallback(() => {
    if (prefs.mode === 'solo') {
      newSoloGame();
      return;
    }
    if (prefs.opponent === 'online') {
      // Propose rematch; progressive ladders nominate the next stage.
      if (roomState?.challengeType === 'progressive') {
        const nextStage = Math.min(5, (roomState.currentStage || 1) + 1);
        void proposeOnlineReset({ targetStage: nextStage });
      } else {
        void proposeOnlineReset();
      }
      return;
    }
    advanceRound();
  }, [
    prefs.mode,
    prefs.opponent,
    advanceRound,
    newSoloGame,
    roomState,
    proposeOnlineReset,
  ]);

  const advanceLocalMatchRound = advanceRound;
  const confirmLocalReset = useCallback(() => {
    advanceRound();
    setShowLocalResetConfirm(false);
  }, [advanceRound, setShowLocalResetConfirm]);
  const cancelLocalReset = useCallback(
    () => setShowLocalResetConfirm(false),
    [setShowLocalResetConfirm],
  );

  // ---------------------------------------------------------------
  // Explicit settings re-creations (P4.4): deliberate fresh boards only.
  // ---------------------------------------------------------------
  const handleSetToEasiest = useCallback(() => {
    prefs.setGridSize(10);
    prefs.setColorCount(4);
    prefs.setBotDifficulty('easy');
    initSoloBoard(10, 4);
    setSoloHintsLeft(3);
    clearHint();
    // Same shape as pre-refactor: a plain 10x4 round with fresh meta.
    initRound({
      size: 10,
      colors: 4,
      startTurn: 1,
      round: 1,
      stage: 1,
      stageWins: { 1: [], 2: [] },
      challengeTypeOverride: prefs.challengeType,
    });
  }, [initRound, initSoloBoard, prefs, clearHint, setSoloHintsLeft]);

  const handleChangeGridSize = useCallback(
    (size: GridSize) => {
      prefs.setGridSize(size);
      initSoloBoard(size, prefs.colorCount);
      setSoloHintsLeft(3);
      clearHint();
      const m = localState;
      if (m && m.challengeType !== 'progressive') {
        initRound({
          size,
          colors: prefs.colorCount,
          startTurn: m.firstTurnPlayer,
          round: m.roundNumber,
          stage: m.currentStage,
          stageWins: m.stageWins,
          challengeTypeOverride: 'standard',
        });
      }
      if (roomState && roomState.challengeType !== 'progressive') {
        updateRoomSettings({ gridSize: size });
      }
    },
    [
      initRound,
      prefs,
      roomState,
      updateRoomSettings,
      localState,
      clearHint,
      initSoloBoard,
      setSoloHintsLeft,
    ],
  );

  const handleChangeColorCount = useCallback(
    (count: ColorCount) => {
      prefs.setColorCount(count);
      initSoloBoard(prefs.gridSize, count);
      setSoloHintsLeft(3);
      clearHint();
      const m = localState;
      if (m && m.challengeType !== 'progressive') {
        initRound({
          size: prefs.gridSize,
          colors: count,
          startTurn: m.firstTurnPlayer,
          round: m.roundNumber,
          stage: m.currentStage,
          stageWins: m.stageWins,
          challengeTypeOverride: 'standard',
        });
      }
      if (roomState && roomState.challengeType !== 'progressive') {
        updateRoomSettings({ colorCount: count });
      }
    },
    [
      initRound,
      prefs,
      roomState,
      updateRoomSettings,
      localState,
      clearHint,
      initSoloBoard,
      setSoloHintsLeft,
    ],
  );

  const handleChangeChallengeType = useCallback(
    (type: ChallengeType) => {
      prefs.setChallengeType(type);
      const m = localState;
      if (type === 'progressive') {
        const s1 = PROGRESSIVE_STAGES[0] || { gridSize: 10, colorCount: 4 };
        initRound({
          size: s1.gridSize,
          colors: s1.colorCount,
          startTurn: m?.firstTurnPlayer ?? 1,
          round: m?.roundNumber ?? 1,
          stage: 1,
          stageWins: m?.stageWins ?? { 1: [], 2: [] },
          challengeTypeOverride: 'progressive',
        });
      } else {
        initRound({
          size: prefs.gridSize,
          colors: prefs.colorCount,
          startTurn: m?.firstTurnPlayer ?? 1,
          round: m?.roundNumber ?? 1,
          stage: m?.currentStage ?? 1,
          stageWins: m?.stageWins ?? { 1: [], 2: [] },
          challengeTypeOverride: 'standard',
        });
      }
      if (roomState) {
        updateRoomSettings({ challengeType: type });
      }
    },
    [initRound, prefs, roomState, updateRoomSettings, localState],
  );

  const handleSelectMode = useCallback(
    (m: GameMode) => {
      prefs.setMode(m);
      clearHint();
    },
    [prefs, clearHint],
  );

  const handleChangeOpponent = useCallback(
    (o: MultiplayerOpponent) => {
      prefs.setOpponent(o);
      if (o !== 'online') {
        // Old behavior: re-init the local match at fresh meta (stage 1 for
        // progressive, chosen board otherwise).
        initRound({
          startTurn: 1,
          round: 1,
          stage: 1,
          stageWins: { 1: [], 2: [] },
          challengeTypeOverride: prefs.challengeType,
        });
      }
    },
    [initRound, prefs],
  );

  const handleChangeTurnTimer = useCallback(
    (sec: 0 | 30 | 60) => {
      // P3.5: per-turn timer; the server enforces host-only.
      updateRoomSettings({ turnTimerSec: sec });
    },
    [updateRoomSettings],
  );

  const handleSelectTheme = useCallback(
    (id: ThemeId) => {
      prefs.setThemeId(id);
      if (roomState) {
        updateRoomSettings({ themeId: id });
      }
    },
    [prefs, roomState, updateRoomSettings],
  );

  return {
    // Preferences
    mode: prefs.mode,
    gridSize: prefs.gridSize,
    colorCount: prefs.colorCount,
    botDifficulty: prefs.botDifficulty,
    challengeType: prefs.challengeType,
    opponent: prefs.opponent,
    showTerritoryOverlay: prefs.showTerritoryOverlay,
    setShowTerritoryOverlay: prefs.setShowTerritoryOverlay,
    showColorSymbols: prefs.showColorSymbols,
    setShowColorSymbols: prefs.setShowColorSymbols,
    showHints: prefs.showHints,
    setShowHints: prefs.setShowHints,
    soundMuted: prefs.soundMuted,
    toggleSound: prefs.toggleSound,
    themeId,
    setThemeId: prefs.setThemeId,
    currentTheme,
    // Online passthrough
    roomState,
    myRole,
    connectionStatus,
    onlineError,
    onlineSystemMessage,
    isMyTurn,
    createOnlineRoom: createRoom,
    joinOnlineRoom: joinRoom,
    leaveOnlineRoom: leaveRoom,
    clearOnlineError: () => setErrorMessage(null),
    updateOnlineSettings: updateRoomSettings,
    acceptOnlineRematch: acceptOnlineReset,
    declineOnlineRematch: declineOnlineReset,
    // Unified state
    soloState,
    localState,
    activeMatch,
    matchGridSize,
    matchColorCount,
    matchSeries,
    matchChallengeType,
    matchStage,
    playerNames,
    onlineOnly,
    isOnlineLobbyActive,
    activeOnlineProposal,
    highScores,
    currentHighScore,
    isBotThinking,
    lastMovingPlayer,
    // Derived view props
    showHintButton,
    paletteColorCount,
    paletteDisabled,
    emoteBarDisabled,
    activeTurn,
    gridView,
    gridMovesCount,
    totalCells,
    matchStatus,
    rematchRequestedBy,
    // Hints
    hint,
    hintGain,
    soloHintsLeft,
    getHint,
    // Solo undo (P5.6)
    undoSolo: undoSoloBoard,
    canUndoSolo,
    // Screen-reader announcements (P5.3)
    announce,
    // Daily Challenge (P6.1)
    dailyActive: !!dailyRound,
    dailyDate: dailyRound?.date ?? null,
    dailyStreak: dailyStreakState,
    startDailyChallenge,
    dailyShareText,
    // Emotes
    activeEmotes,
    triggerEmote,
    // Actions
    setOpponent: prefs.setOpponent,
    pickColor,
    newSoloGame,
    initiateReset,
    playAgain,
    advanceLocalMatchRound,
    resetSeries,
    handleSetToEasiest,
    handleChangeGridSize,
    handleChangeColorCount,
    handleChangeChallengeType,
    handleSetBotDifficulty: prefs.setBotDifficulty,
    handleSelectMode,
    handleChangeOpponent,
    handleChangeTurnTimer,
    handleSelectTheme,
    turnTimerEditable,
    showLocalResetConfirm,
    confirmLocalReset,
    cancelLocalReset,
  };
}
