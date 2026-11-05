import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Github, Linkedin, Info } from 'lucide-react';

import {
  GridSize,
  ColorCount,
  GameMode,
  MultiplayerOpponent,
  BotDifficulty,
  SoloGameState,
  TwoPlayerGameState,
  HighScore,
  SeriesScore,
  ActiveEmote,
  ThemeId,
  ChallengeType,
} from './types';

import {
  generateSoloGrid,
  floodSolo,
  checkSoloWin,
  getBestSoloMove,
  generateTwoPlayerGrid,
  expandPlayerTerritory,
  getBestMultiplayerMove,
  checkMultiplayerGameOver,
} from './utils/floodLogic';
import { maxSoloMovesLimit } from './utils/soloBalance';

import { THEMES, PROGRESSIVE_STAGES } from './utils/themes';
import { useOnlineMultiplayer, loadStoredSession } from './utils/useOnlineMultiplayer';
import { requestBotMove } from './utils/botWorkerClient';
import {
  loadBool,
  loadJson,
  loadString,
  loadStringOr,
  saveJson,
  saveString,
} from './utils/storage';
import { z } from 'zod';

import { Header } from './components/Header';
import { SoloScoreboard } from './components/SoloScoreboard';
import { TwoPlayerScoreboard } from './components/TwoPlayerScoreboard';
import { GameGrid } from './components/GameGrid';
import { ColorPalette } from './components/ColorPalette';
import { GameOverModal } from './components/GameOverModal';
import { SettingsPanel } from './components/SettingsPanel';
import { HowToPlayModal } from './components/HowToPlayModal';
import { OnlineLobby } from './components/OnlineLobby';
import { MultiplayerEmotes } from './components/MultiplayerEmotes';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { ResetApprovalModal } from './components/ResetApprovalModal';
import {
  playEmotePopSound,
  playLoseSound,
  playMoveSound,
  playWinSound,
  isMuted,
  setMuted,
} from './utils/soundEffects';

// P4.5: persisted-state schemas — corrupted localStorage can never crash the app.
const HighScoreSchema = z.object({
  size: z.number().int().min(5).max(30),
  colors: z.number().int().min(2).max(12),
  moves: z.number().int().min(1).max(9999),
});
const HighScoresSchema = z.array(HighScoreSchema).max(50);
const SeriesScoreSchema = z.object({
  p1: z.number().int().min(0).max(999999),
  p2: z.number().int().min(0).max(999999),
  draws: z.number().int().min(0).max(999999),
});

export default function App() {
  // --- Online Multiplayer Hook ---
  const {
    roomState,
    myRole,
    connectionStatus,
    errorMessage: onlineError,
    systemMessage: onlineSystemMessage,
    isMyTurn,
    createRoom,
    joinRoom,
    makeMove: sendOnlineMove,
    proposeReset: sendOnlineProposeReset,
    acceptReset: sendOnlineAcceptReset,
    declineReset: sendOnlineDeclineReset,
    updateRoomSettings,
    leaveRoom: sendLeaveRoom,
    setErrorMessage: setOnlineError,
    sendOnlineEmote,
    setOnEmoteCallback,
  } = useOnlineMultiplayer();

  // --- Themes & Visual Style ---
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = loadStringOr('theme', 'arcade', 'color-flood-theme');
    return (saved as ThemeId) || 'arcade';
  });
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Sync theme when online room has a specific theme
  useEffect(() => {
    if (roomState?.themeId && (roomState.themeId as ThemeId) in THEMES) {
      setThemeId(roomState.themeId as ThemeId);
    }
  }, [roomState?.themeId]);

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
  }, [joinRoom]);

  const currentTheme = useMemo(() => THEMES[themeId] || THEMES.arcade, [themeId]);

  // --- Game Mode & Preferences: DEFAULT TO EASIEST SETUP ---
  const [mode, setMode] = useState<GameMode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) return 'multiplayer';
    const saved = loadString('mode', 'color-flood-mode');
    return saved === 'multiplayer' ? 'multiplayer' : 'solo';
  });

  const [gridSize, setGridSize] = useState<GridSize>(() => {
    const saved = loadString('grid-size', 'color-flood-grid-size');
    return saved ? (Number(saved) as GridSize) : 10;
  });

  const [colorCount, setColorCount] = useState<ColorCount>(() => {
    const saved = loadString('color-count', 'color-flood-color-count');
    return saved ? (Number(saved) as ColorCount) : 4;
  });

  const [opponent, setOpponent] = useState<MultiplayerOpponent>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) return 'online';
    const saved = loadString('opponent', 'color-flood-opponent');
    return (saved as MultiplayerOpponent) || 'local';
  });

  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => {
    const saved = loadString('bot-diff', 'color-flood-bot-diff');
    return (saved as BotDifficulty) || 'easy';
  });

  const [challengeType, setChallengeType] = useState<ChallengeType>(() => {
    const saved = loadString('challenge-type', 'color-flood-challenge-type');
    return (saved as ChallengeType) || 'progressive';
  });

  const [showTerritoryOverlay, setShowTerritoryOverlay] = useState<boolean>(() => {
    const saved = loadString('overlay', 'color-flood-overlay');
    return saved !== 'false';
  });

  // --- Progressive & Alternating Turn Order Trackers ---
  const [roundNumber, setRoundNumber] = useState(1);
  const [firstTurnPlayer, setFirstTurnPlayer] = useState<1 | 2>(1);
  const [currentStage, setCurrentStage] = useState(1);
  const [stageWins, setStageWins] = useState<{ 1: number[]; 2: number[] }>({
    1: [],
    2: [],
  });

  // --- Modals & Local Reset Confirmations ---
  const [showSettings, setShowSettings] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showLocalResetConfirm, setShowLocalResetConfirm] = useState(false);
  const [hint, setHint] = useState<number | null>(null);
  const [hintGain, setHintGain] = useState<number | undefined>(undefined);
  // P4.8: sound effects with a persisted mute toggle.
  const [soundMuted, setSoundMuted] = useState<boolean>(() => isMuted());
  // Solo hints are limited per game (Phase 2). Local/bot hints are opt-in and off by
  // default; online play never exposes hints.
  const [soloHintsLeft, setSoloHintsLeft] = useState(3);
  const [showHints, setShowHints] = useState<boolean>(() => {
    return loadBool('show-hints', false, 'color-flood-show-hints');
  });
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [lastMovingPlayer, setLastMovingPlayer] = useState<1 | 2>(1);
  const [activeEmotes, setActiveEmotes] = useState<ActiveEmote[]>([]);

  // --- High Scores & Series Scores ---
  const [highScores, setHighScores] = useState<HighScore[]>(() => {
    return loadJson('high-scores', HighScoresSchema, 'color-flood-high-scores') ?? [];
  });

  const [seriesScore, setSeriesScore] = useState<SeriesScore>(() => {
    return (
      loadJson('2p-series', SeriesScoreSchema, 'color-flood-2p-series') ?? {
        p1: 0,
        p2: 0,
        draws: 0,
      }
    );
  });

  // --- Game States ---
  const [soloState, setSoloState] = useState<SoloGameState | null>(null);
  const [twoPlayerState, setTwoPlayerState] = useState<TwoPlayerGameState | null>(null);
  const twoPlayerStateRef = useRef<TwoPlayerGameState | null>(twoPlayerState);
  twoPlayerStateRef.current = twoPlayerState;

  // --- Game Initializers ---
  const initSoloGame = useCallback((size: GridSize, colors: ColorCount) => {
    const newGrid = generateSoloGrid(size, colors);
    setSoloState({
      grid: newGrid,
      moves: 0,
      maxMoves: maxSoloMovesLimit(size, colors),
      status: 'playing',
      history: [newGrid.map((r) => [...r])],
    });
    setHint(null);
    setHintGain(undefined);
    setSoloHintsLeft(3);
  }, []);

  const initMultiplayerGame = useCallback(
    (
      size: number,
      colors: number,
      startingTurn: 1 | 2 = 1,
      targetRound = 1,
      targetStage = 1,
      persistedStageWins = { 1: [], 2: [] },
    ) => {
      const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateTwoPlayerGrid(
        size,
        colors,
      );
      setTwoPlayerState({
        grid,
        turn: startingTurn,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
        movesCount: 0,
        status: 'playing',
        p1Moves: 0,
        p2Moves: 0,
        lastGains: { 1: 0, 2: 0 },
        roundNumber: targetRound,
        firstTurnPlayer: startingTurn,
        challengeType,
        currentStage: targetStage,
        stageWins: persistedStageWins,
        resetProposal: null,
      });
      setHint(null);
      setHintGain(undefined);
      setIsBotThinking(false);
      setLastMovingPlayer(startingTurn);
    },
    [challengeType],
  );

  // Initialize on first mount
  useEffect(() => {
    initSoloGame(gridSize, colorCount);
    const startStage = PROGRESSIVE_STAGES[0];
    const initSize = challengeType === 'progressive' ? startStage.gridSize : gridSize;
    const initColors =
      challengeType === 'progressive' ? startStage.colorCount : colorCount;
    initMultiplayerGame(initSize, initColors, 1, 1, 1, { 1: [], 2: [] });
  }, [initSoloGame, initMultiplayerGame, gridSize, colorCount, challengeType]);

  // Persist preferences
  useEffect(() => {
    saveString('theme', themeId);
  }, [themeId]);

  useEffect(() => {
    saveString('mode', mode);
  }, [mode]);

  useEffect(() => {
    saveString('grid-size', String(gridSize));
  }, [gridSize]);

  useEffect(() => {
    saveString('color-count', String(colorCount));
  }, [colorCount]);

  useEffect(() => {
    saveString('opponent', opponent);
  }, [opponent]);

  useEffect(() => {
    saveString('bot-diff', botDifficulty);
  }, [botDifficulty]);

  useEffect(() => {
    saveString('challenge-type', challengeType);
  }, [challengeType]);

  useEffect(() => {
    saveString('overlay', String(showTerritoryOverlay));
  }, [showTerritoryOverlay]);

  useEffect(() => {
    saveString('show-hints', String(showHints));
  }, [showHints]);

  // Sync last moving player in online mode
  useEffect(() => {
    if (opponent === 'online' && roomState) {
      setLastMovingPlayer(roomState.turn === 1 ? 2 : 1);
    }
  }, [opponent, roomState?.turn, roomState?.movesCount]);

  // Confetti on Online Game Outcome
  useEffect(() => {
    if (
      opponent === 'online' &&
      roomState &&
      roomState.status !== 'playing' &&
      roomState.status !== 'waiting'
    ) {
      if (roomState.status !== 'draw') {
        confetti({
          particleCount: 160,
          spread: 80,
          origin: { y: 0.55 },
          colors: currentTheme.colors.slice(0, roomState.colorCount),
        });
        // P4.8: praise a win, commiserate a loss (mute is per device).
        const iWon =
          (roomState.status === 'p1_won' && myRole === 1) ||
          (roomState.status === 'p2_won' && myRole === 2);
        if (iWon) {
          playWinSound();
        } else if (myRole) {
          playLoseSound();
        }
      }
    }
  }, [opponent, roomState?.status, roomState?.colorCount, currentTheme, myRole]);

  // --- Emote Interaction Handler ---
  const triggerEmote = useCallback(
    (sender: 1 | 2, emoji: string, broadcastOnline = true) => {
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

      if (broadcastOnline && opponent === 'online') {
        sendOnlineEmote(emoji);
      }

      if (opponent === 'bot' && sender === 1) {
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
    [opponent, sendOnlineEmote],
  );

  useEffect(() => {
    setOnEmoteCallback((role, emoji) => {
      triggerEmote(role, emoji, false);
    });
  }, [setOnEmoteCallback, triggerEmote]);

  // --- High Score Update ---
  const updateHighScores = useCallback(
    (moves: number) => {
      setHighScores((prev) => {
        const existingIndex = prev.findIndex(
          (s) => s.size === gridSize && s.colors === colorCount,
        );
        let newScores: HighScore[];
        if (existingIndex > -1) {
          if (moves < prev[existingIndex].moves) {
            newScores = [...prev];
            newScores[existingIndex] = { size: gridSize, colors: colorCount, moves };
          } else {
            return prev;
          }
        } else {
          newScores = [...prev, { size: gridSize, colors: colorCount, moves }];
        }
        saveJson('high-scores', newScores);
        return newScores;
      });
    },
    [gridSize, colorCount],
  );

  // --- Series Score Update ---
  const updateSeriesScore = useCallback((winner: 'p1_won' | 'p2_won' | 'draw') => {
    setSeriesScore((prev) => {
      const updated = {
        p1: winner === 'p1_won' ? prev.p1 + 1 : prev.p1,
        p2: winner === 'p2_won' ? prev.p2 + 1 : prev.p2,
        draws: winner === 'draw' ? prev.draws + 1 : prev.draws,
      };
      saveJson('2p-series', updated);
      return updated;
    });
  }, []);

  const resetSeriesScore = useCallback(() => {
    const cleared = { p1: 0, p2: 0, draws: 0 };
    setSeriesScore(cleared);
    setStageWins({ 1: [], 2: [] });
    setCurrentStage(1);
    setRoundNumber(1);
    setFirstTurnPlayer(1);
    saveJson('2p-series', cleared);
  }, []);

  // --- Reset to Easiest Setup ---
  const handleSetToEasiest = useCallback(() => {
    setGridSize(10);
    setColorCount(4);
    setBotDifficulty('easy');
    initSoloGame(10, 4);
    initMultiplayerGame(10, 4, 1, 1, 1, { 1: [], 2: [] });
  }, [initSoloGame, initMultiplayerGame]);

  // --- Solo Action Handlers ---
  const handleSoloColorClick = (colorIndex: number) => {
    if (!soloState || soloState.status !== 'playing') return;
    if (colorIndex === soloState.grid[0][0]) return;

    setLastMovingPlayer(1);
    playMoveSound(colorIndex);
    const newGrid = floodSolo(soloState.grid, colorIndex);
    const newMoves = soloState.moves + 1;
    const isWin = checkSoloWin(newGrid);
    const isLoss = !isWin && newMoves >= soloState.maxMoves;

    setSoloState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        grid: newGrid,
        moves: newMoves,
        status: isWin ? 'won' : isLoss ? 'lost' : 'playing',
        history: [...prev.history, newGrid.map((row) => [...row])],
      };
    });

    setHint(null);
    setHintGain(undefined);

    if (isWin) {
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.6 },
        colors: currentTheme.colors.slice(0, colorCount),
      });
      playWinSound();
      updateHighScores(newMoves);
    } else if (isLoss) {
      playLoseSound();
    }
  };

  // --- Local / Bot Multiplayer Action Handlers ---
  const executeLocalMultiplayerMove = useCallback(
    (colorIndex: number) => {
      const currentState = twoPlayerStateRef.current;
      if (!currentState || currentState.status !== 'playing') return;

      const { turn, p1Cells, p2Cells, p1Color, p2Color, grid } = currentState;

      if (turn === 1 && (colorIndex === p1Color || colorIndex === p2Color)) return;
      if (turn === 2 && (colorIndex === p2Color || colorIndex === p1Color)) return;

      setLastMovingPlayer(turn);
      playMoveSound(colorIndex);

      const currentCells = turn === 1 ? p1Cells : p2Cells;
      const opponentCells = turn === 1 ? p2Cells : p1Cells;

      const { newGrid, newCells, gain } = expandPlayerTerritory(
        grid,
        currentCells,
        opponentCells,
        colorIndex,
      );

      const nextP1Cells = turn === 1 ? newCells : p1Cells;
      const nextP2Cells = turn === 2 ? newCells : p2Cells;
      const nextP1Color = turn === 1 ? colorIndex : p1Color;
      const nextP2Color = turn === 2 ? colorIndex : p2Color;

      const totalCells = currentState.grid.length * currentState.grid.length;
      const activeColorCount =
        currentState.challengeType === 'progressive'
          ? PROGRESSIVE_STAGES[currentState.currentStage - 1]?.colorCount || 4
          : colorCount;

      const gameOutcome = checkMultiplayerGameOver(
        totalCells,
        nextP1Cells.length,
        nextP2Cells.length,
        activeColorCount,
        nextP1Color,
        nextP2Color,
        newGrid,
        nextP1Cells,
        nextP2Cells,
      );

      const nextStageWins = {
        1: [...currentState.stageWins[1]],
        2: [...currentState.stageWins[2]],
      };

      if (gameOutcome !== 'playing' && currentState.challengeType === 'progressive') {
        if (
          gameOutcome === 'p1_won' &&
          !nextStageWins[1].includes(currentState.currentStage)
        ) {
          nextStageWins[1].push(currentState.currentStage);
        } else if (
          gameOutcome === 'p2_won' &&
          !nextStageWins[2].includes(currentState.currentStage)
        ) {
          nextStageWins[2].push(currentState.currentStage);
        }
        setStageWins(nextStageWins);
      }

      setTwoPlayerState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          grid: newGrid,
          turn: turn === 1 ? 2 : 1,
          p1Cells: nextP1Cells,
          p2Cells: nextP2Cells,
          p1Color: nextP1Color,
          p2Color: nextP2Color,
          movesCount: prev.movesCount + 1,
          p1Moves: turn === 1 ? prev.p1Moves + 1 : prev.p1Moves,
          p2Moves: turn === 2 ? prev.p2Moves + 1 : prev.p2Moves,
          status: gameOutcome,
          stageWins: nextStageWins,
          lastGains: {
            ...prev.lastGains,
            [turn]: gain,
          },
        };
      });

      setHint(null);
      setHintGain(undefined);

      if (gameOutcome !== 'playing') {
        if (gameOutcome !== 'draw') {
          confetti({
            particleCount: 180,
            spread: 90,
            origin: { y: 0.55 },
            colors: currentTheme.colors.slice(0, activeColorCount),
          });
          playWinSound();
        }
        updateSeriesScore(gameOutcome);
      } else if (opponent === 'bot') {
        if (turn === 1 && gain >= Math.max(5, Math.floor(totalCells * 0.08))) {
          setTimeout(() => {
            triggerEmote(
              2,
              Math.random() < 0.4 ? '😭' : Math.random() < 0.5 ? '😮' : '💀',
              false,
            );
          }, 350);
        } else if (turn === 2 && gain >= Math.max(4, Math.floor(totalCells * 0.07))) {
          setTimeout(() => {
            triggerEmote(2, Math.random() < 0.5 ? '😎' : '🔥', false);
          }, 350);
        }
      }
    },
    [colorCount, updateSeriesScore, opponent, triggerEmote, currentTheme],
  );

  // Bot Turn Automation
  useEffect(() => {
    if (
      mode !== 'multiplayer' ||
      opponent !== 'bot' ||
      !twoPlayerState ||
      twoPlayerState.status !== 'playing' ||
      twoPlayerState.turn !== 2
    ) {
      setIsBotThinking(false);
      return;
    }

    setIsBotThinking(true);
    const activeColorCount =
      twoPlayerState.challengeType === 'progressive'
        ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]?.colorCount || 4
        : colorCount;

    // Set false when the effect is torn down (user acted, round ended, unmount).
    let cancelled = false;

    const timer = setTimeout(() => {
      const currentState = twoPlayerStateRef.current;
      if (!currentState || currentState.status !== 'playing' || currentState.turn !== 2) {
        setIsBotThinking(false);
        return;
      }

      // P2.7: bot runs in a Web Worker so the minimax search never blocks the UI.
      // Stale responses (state changed while the worker computed) are dropped.
      requestBotMove({
        grid: currentState.grid,
        activePlayer: 2,
        p1Cells: currentState.p1Cells,
        p2Cells: currentState.p2Cells,
        p1Color: currentState.p1Color,
        p2Color: currentState.p2Color,
        colorCount: activeColorCount,
        difficulty: botDifficulty,
      }).then((bestColor) => {
        if (cancelled) return;
        if (
          twoPlayerStateRef.current !== currentState ||
          currentState.status !== 'playing' ||
          currentState.turn !== 2
        ) {
          setIsBotThinking(false);
          return;
        }
        setIsBotThinking(false);
        executeLocalMultiplayerMove(bestColor);
      });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    mode,
    opponent,
    twoPlayerState?.turn,
    twoPlayerState?.status,
    twoPlayerState?.challengeType,
    twoPlayerState?.currentStage,
    colorCount,
    botDifficulty,
    executeLocalMultiplayerMove,
  ]);

  // --- Hint System ---
  const handleGetHint = () => {
    if (mode === 'solo') {
      if (!soloState || soloState.status !== 'playing') return;
      // Limited hints: 3 per solo game. Never free.
      if (soloHintsLeft <= 0) return;
      setSoloHintsLeft((n) => Math.max(0, n - 1));
      const best = getBestSoloMove(soloState.grid, colorCount);
      setHint(best);
      setHintGain(undefined);
    } else if (opponent === 'online') {
      // Hints are disabled entirely in online play (they would reveal a near-optimal
      // move to both players for free).
      return;
    } else {
      // Local and bot matches: hints are opt-in and off by default.
      if (!showHints) return;
      if (!twoPlayerState || twoPlayerState.status !== 'playing') return;
      const activePlayer = twoPlayerState.turn;
      const activeColors =
        twoPlayerState.challengeType === 'progressive'
          ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]?.colorCount || 4
          : colorCount;
      const { bestColor, maxGain } = getBestMultiplayerMove(
        twoPlayerState.grid,
        activePlayer,
        twoPlayerState.p1Cells,
        twoPlayerState.p2Cells,
        twoPlayerState.p1Color,
        twoPlayerState.p2Color,
        activeColors,
        'master',
        // Hints run on the main thread: hard cap the search time so the UI
        // never freezes (checked every 256 nodes).
        { deadlineMs: 300, now: () => performance.now() },
      );
      setHint(bestColor);
      setHintGain(maxGain);
    }
  };

  // --- Reset Request Handler with Opponent Approval ---
  const handleInitiateReset = () => {
    if (mode === 'solo') {
      initSoloGame(gridSize, colorCount);
      return;
    }

    if (opponent === 'online') {
      // In online multiplayer, send reset proposal requiring approval
      sendOnlineProposeReset();
      return;
    }

    if (opponent === 'local') {
      // In local pass & play, prompt confirmation so accidental taps don't clear board
      setShowLocalResetConfirm(true);
      return;
    }

    if (opponent === 'bot') {
      // vs AI Bot: Auto-resets and alternates starting player
      advanceLocalMultiplayerRound();
    }
  };

  // --- Advance Local Multiplayer Round (with Alternating First Player & Progressive Ladder) ---
  const advanceLocalMultiplayerRound = (nextStageOverride?: number) => {
    const nextRound = roundNumber + 1;
    // Strictly alternate first turn!
    const nextFirstPlayer: 1 | 2 = firstTurnPlayer === 1 ? 2 : 1;
    setRoundNumber(nextRound);
    setFirstTurnPlayer(nextFirstPlayer);

    if (challengeType === 'progressive') {
      const targetStage =
        nextStageOverride !== undefined
          ? nextStageOverride
          : Math.min(5, currentStage + 1);
      setCurrentStage(targetStage);
      const stageConfig = PROGRESSIVE_STAGES[targetStage - 1] || PROGRESSIVE_STAGES[0];
      initMultiplayerGame(
        stageConfig.gridSize,
        stageConfig.colorCount,
        nextFirstPlayer,
        nextRound,
        targetStage,
        stageWins,
      );
    } else {
      initMultiplayerGame(
        gridSize,
        colorCount,
        nextFirstPlayer,
        nextRound,
        currentStage,
        stageWins,
      );
    }
    setShowLocalResetConfirm(false);
  };

  // --- Play Again / Next Round in GameOverModal ---
  const handlePlayAgainFromModal = async () => {
    if (mode === 'solo') {
      initSoloGame(gridSize, colorCount);
      return;
    }

    if (opponent === 'online') {
      // Propose rematch with alternating starting turn
      if (roomState?.challengeType === 'progressive') {
        const nextStage = Math.min(5, (roomState.currentStage || 1) + 1);
        await sendOnlineProposeReset({ targetStage: nextStage });
      } else {
        await sendOnlineProposeReset();
      }
      return;
    }

    // Local / Bot: Advance to next stage / round with alternating first player!
    advanceLocalMultiplayerRound();
  };

  const handleChangeGridSize = (size: GridSize) => {
    setGridSize(size);
    initSoloGame(size, colorCount);
    if (challengeType !== 'progressive') {
      initMultiplayerGame(
        size,
        colorCount,
        firstTurnPlayer,
        roundNumber,
        currentStage,
        stageWins,
      );
    }
    if (opponent === 'online' && roomState && roomState.challengeType !== 'progressive') {
      updateRoomSettings({ gridSize: size });
    }
  };

  const handleChangeColorCount = (count: ColorCount) => {
    setColorCount(count);
    initSoloGame(gridSize, count);
    if (challengeType !== 'progressive') {
      initMultiplayerGame(
        gridSize,
        count,
        firstTurnPlayer,
        roundNumber,
        currentStage,
        stageWins,
      );
    }
    if (opponent === 'online' && roomState && roomState.challengeType !== 'progressive') {
      updateRoomSettings({ colorCount: count });
    }
  };

  // Online only (P3.5): per-turn timer; the server enforces host-only.
  const handleChangeTurnTimer = (sec: 0 | 30 | 60) => {
    if (opponent === 'online' && roomState) {
      updateRoomSettings({ turnTimerSec: sec });
    }
  };

  // P4.8: sound mute toggle (persisted by the audio module).
  const handleToggleSound = () => {
    setSoundMuted((prev) => {
      setMuted(!prev);
      return !prev;
    });
  };

  const handleChangeChallengeType = (type: ChallengeType) => {
    setChallengeType(type);
    if (type === 'progressive') {
      const s1 = PROGRESSIVE_STAGES[0];
      setCurrentStage(1);
      initMultiplayerGame(
        s1.gridSize,
        s1.colorCount,
        firstTurnPlayer,
        roundNumber,
        1,
        stageWins,
      );
    } else {
      initMultiplayerGame(
        gridSize,
        colorCount,
        firstTurnPlayer,
        roundNumber,
        currentStage,
        stageWins,
      );
    }
    if (opponent === 'online' && roomState) {
      updateRoomSettings({ challengeType: type });
    }
  };

  const handleDownloadIcon = () => {
    const svg = document.querySelector('header svg');
    if (!svg) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = 'color-flood-icon.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const currentHighScore = useMemo(() => {
    return (
      highScores.find((s) => s.size === gridSize && s.colors === colorCount)?.moves ||
      null
    );
  }, [highScores, gridSize, colorCount]);

  if (!soloState || !twoPlayerState) return null;

  const isOnlineLobbyActive =
    mode === 'multiplayer' &&
    opponent === 'online' &&
    (!roomState || roomState.status === 'waiting');

  const activeOnlineProposal =
    opponent === 'online' && roomState?.resetProposal ? roomState.resetProposal : null;

  return (
    <div className="h-[100dvh] w-full max-w-full bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col justify-between overflow-x-hidden overflow-y-auto">
      {/* Top Streamlined Header */}
      <div className="w-full shrink-0">
        <Header
          mode={mode}
          onSelectMode={(newMode) => {
            setMode(newMode);
            setHint(null);
            setHintGain(undefined);
          }}
          opponent={opponent}
          onChangeOpponent={(opp) => {
            setOpponent(opp);
            if (opp !== 'online') {
              const startStage = PROGRESSIVE_STAGES[0];
              const sSize =
                challengeType === 'progressive' ? startStage.gridSize : gridSize;
              const sColor =
                challengeType === 'progressive' ? startStage.colorCount : colorCount;
              initMultiplayerGame(sSize, sColor, 1, 1, 1, { 1: [], 2: [] });
            }
          }}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings((prev) => !prev)}
          onToggleInfo={() => setShowInfoModal(true)}
          onToggleThemes={() => setShowThemeModal(true)}
          onResetGame={handleInitiateReset}
        />

        {/* Online System Banner */}
        {opponent === 'online' && onlineSystemMessage && (
          <div className="max-w-lg mx-auto px-2 mt-1">
            <div className="bg-slate-850/90 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-[11px] text-indigo-200 flex items-center gap-1.5 shadow-sm">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{onlineSystemMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Playable Area */}
      <main className="w-full max-w-lg mx-auto px-2 sm:px-3 py-1 flex-1 flex flex-col items-center justify-center">
        {/* Settings Drawer */}
        {showSettings && (
          <SettingsPanel
            gridSize={gridSize}
            onChangeGridSize={handleChangeGridSize}
            colorCount={colorCount}
            onChangeColorCount={handleChangeColorCount}
            mode={mode}
            opponent={opponent}
            onChangeOpponent={setOpponent}
            botDifficulty={botDifficulty}
            onChangeBotDifficulty={setBotDifficulty}
            showTerritoryOverlay={showTerritoryOverlay}
            onToggleTerritoryOverlay={() => setShowTerritoryOverlay((prev) => !prev)}
            showHints={showHints}
            onToggleShowHints={() => setShowHints((prev) => !prev)}
            onResetSeries={resetSeriesScore}
            onSetToEasiest={handleSetToEasiest}
            activeThemeId={themeId}
            onOpenThemeModal={() => setShowThemeModal(true)}
            challengeType={challengeType}
            onChangeChallengeType={handleChangeChallengeType}
            turnTimerSec={roomState?.turnTimerSec ?? 0}
            onChangeTurnTimerSec={
              opponent === 'online' && myRole === 1 ? handleChangeTurnTimer : undefined
            }
            soundMuted={soundMuted}
            onToggleSound={handleToggleSound}
            onDownloadIcon={import.meta.env.DEV ? handleDownloadIcon : undefined}
          />
        )}

        {/* Online Match: Show Lobby or Game */}
        {isOnlineLobbyActive ? (
          <OnlineLobby
            roomState={roomState}
            myRole={myRole}
            connectionStatus={connectionStatus}
            errorMessage={onlineError}
            systemMessage={onlineSystemMessage}
            gridSize={gridSize}
            colorCount={colorCount}
            onCreateRoom={(name, gSize, cCount, cType) =>
              createRoom(name, gSize, cCount, cType, themeId)
            }
            onJoinRoom={joinRoom}
            onLeaveRoom={sendLeaveRoom}
            onClearError={() => setOnlineError(null)}
          />
        ) : (
          <div className="w-full flex flex-col items-center justify-between flex-1 max-h-[84vh]">
            {/* Active Mode Scoreboard */}
            {mode === 'solo' ? (
              <SoloScoreboard
                gameState={soloState}
                currentHighScore={currentHighScore}
                onGetHint={handleGetHint}
                hint={hint}
                hintsLeft={soloHintsLeft}
                colorCount={colorCount}
              />
            ) : opponent === 'online' && roomState ? (
              <TwoPlayerScoreboard
                gameState={{
                  ...roomState,
                  roundNumber: roomState.roundNumber || 1,
                  firstTurnPlayer: roomState.firstTurnPlayer || 1,
                  challengeType: roomState.challengeType || 'standard',
                  currentStage: roomState.currentStage || 1,
                  stageWins: roomState.stageWins || { 1: [], 2: [] },
                  resetProposal: roomState.resetProposal || null,
                }}
                gridSize={roomState.gridSize}
                opponent={opponent}
                seriesScore={roomState.series}
                onGetHint={handleGetHint}
                hint={hint}
                showHintButton={false}
                activeEmotes={activeEmotes}
                p1Name={roomState.p1Name}
                p2Name={roomState.p2Name}
                myRole={myRole}
                roomId={roomState.roomId}
                p1Connected={roomState.p1Connected}
                p2Connected={roomState.p2Connected}
                theme={currentTheme}
                onRequestReset={handleInitiateReset}
              />
            ) : (
              <TwoPlayerScoreboard
                gameState={twoPlayerState}
                gridSize={
                  twoPlayerState.challengeType === 'progressive'
                    ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]?.gridSize || 10
                    : gridSize
                }
                opponent={opponent}
                seriesScore={seriesScore}
                isBotThinking={isBotThinking}
                onGetHint={handleGetHint}
                hint={hint}
                showHintButton={showHints}
                activeEmotes={activeEmotes}
                theme={currentTheme}
                onRequestReset={handleInitiateReset}
              />
            )}

            {/* Game Grid with Fluid Wave Animations & Theme Styling */}
            <div className="relative my-0.5 shrink-0 flex items-center justify-center">
              <GameGrid
                grid={
                  mode === 'solo'
                    ? soloState.grid
                    : opponent === 'online' && roomState
                      ? roomState.grid
                      : twoPlayerState.grid
                }
                gridSize={
                  mode === 'solo'
                    ? gridSize
                    : opponent === 'online' && roomState
                      ? roomState.gridSize
                      : twoPlayerState.challengeType === 'progressive'
                        ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]?.gridSize ||
                          10
                        : gridSize
                }
                mode={mode}
                opponent={opponent}
                p1Cells={
                  opponent === 'online' && roomState
                    ? roomState.p1Cells
                    : twoPlayerState.p1Cells
                }
                p2Cells={
                  opponent === 'online' && roomState
                    ? roomState.p2Cells
                    : twoPlayerState.p2Cells
                }
                showTerritoryOverlay={showTerritoryOverlay}
                lastMovingPlayer={lastMovingPlayer}
                theme={currentTheme}
              />

              {/* Game Over Modal Overlay */}
              <GameOverModal
                mode={mode}
                soloStatus={soloState.status}
                soloMoves={soloState.moves}
                multiplayerStatus={
                  opponent === 'online' && roomState
                    ? roomState.status
                    : twoPlayerState.status
                }
                p1Count={
                  opponent === 'online' && roomState
                    ? roomState.p1Cells.length
                    : twoPlayerState.p1Cells.length
                }
                p2Count={
                  opponent === 'online' && roomState
                    ? roomState.p2Cells.length
                    : twoPlayerState.p2Cells.length
                }
                totalCells={
                  mode === 'solo'
                    ? gridSize ** 2
                    : (opponent === 'online' && roomState
                        ? roomState.gridSize
                        : twoPlayerState.challengeType === 'progressive'
                          ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]
                              ?.gridSize || 10
                          : gridSize) ** 2
                }
                opponent={opponent}
                seriesScore={
                  opponent === 'online' && roomState ? roomState.series : seriesScore
                }
                challengeType={
                  opponent === 'online' && roomState
                    ? roomState.challengeType
                    : challengeType
                }
                currentStage={
                  opponent === 'online' && roomState
                    ? roomState.currentStage
                    : currentStage
                }
                onPlayAgain={handlePlayAgainFromModal}
                onAcceptRematch={sendOnlineAcceptReset}
                onDeclineRematch={sendOnlineDeclineReset}
                onResetSeries={resetSeriesScore}
                p1Name={opponent === 'online' && roomState ? roomState.p1Name : undefined}
                p2Name={opponent === 'online' && roomState ? roomState.p2Name : undefined}
                myRole={myRole}
                rematchRequestedBy={roomState?.rematchRequestedBy}
                onLeaveRoom={sendLeaveRoom}
              />
            </div>

            {/* Interactive Multiplayer Emote Reaction Bar */}
            {mode === 'multiplayer' && (
              <MultiplayerEmotes
                opponent={opponent}
                myRole={myRole}
                activeTurn={
                  opponent === 'online' && roomState
                    ? roomState.turn
                    : twoPlayerState?.turn || 1
                }
                activeEmotes={activeEmotes}
                onSendEmote={(sender, emoji) => triggerEmote(sender, emoji, true)}
                p1Name={
                  opponent === 'online' && roomState ? roomState.p1Name : 'Player 1'
                }
                p2Name={
                  opponent === 'online' && roomState
                    ? roomState.p2Name
                    : opponent === 'bot'
                      ? 'AI Bot'
                      : 'Player 2'
                }
                disabled={
                  (opponent === 'online' && roomState?.status !== 'playing') ||
                  (opponent !== 'online' && twoPlayerState?.status !== 'playing')
                }
              />
            )}

            {/* Color Action Palette */}
            <ColorPalette
              colorCount={
                mode === 'solo'
                  ? colorCount
                  : opponent === 'online' && roomState
                    ? roomState.colorCount
                    : twoPlayerState.challengeType === 'progressive'
                      ? PROGRESSIVE_STAGES[twoPlayerState.currentStage - 1]?.colorCount ||
                        4
                      : colorCount
              }
              mode={mode}
              onSelectColor={
                mode === 'solo'
                  ? handleSoloColorClick
                  : opponent === 'online'
                    ? (col) => {
                        setLastMovingPlayer(myRole || 1);
                        playMoveSound(col);
                        sendOnlineMove(col);
                      }
                    : executeLocalMultiplayerMove
              }
              disabled={
                mode === 'solo'
                  ? soloState.status !== 'playing'
                  : opponent === 'online'
                    ? !isMyTurn || roomState?.status !== 'playing'
                    : twoPlayerState.status !== 'playing' ||
                      (opponent === 'bot' && twoPlayerState.turn === 2)
              }
              hint={hint}
              hintGain={hintGain}
              soloCurrentColor={soloState.grid[0][0]}
              p1Color={
                opponent === 'online' && roomState
                  ? roomState.p1Color
                  : twoPlayerState.p1Color
              }
              p2Color={
                opponent === 'online' && roomState
                  ? roomState.p2Color
                  : twoPlayerState.p2Color
              }
              activeTurn={
                opponent === 'online' && roomState ? roomState.turn : twoPlayerState.turn
              }
              opponent={opponent}
              theme={currentTheme}
            />
          </div>
        )}
      </main>

      {/* Opponent Reset Approval Modal */}
      <ResetApprovalModal
        isOpen={Boolean(activeOnlineProposal) || showLocalResetConfirm}
        proposal={activeOnlineProposal}
        myRole={myRole}
        opponent={opponent}
        p1Name={roomState?.p1Name || 'Player 1'}
        p2Name={roomState?.p2Name || 'Player 2'}
        isLocalConfirm={showLocalResetConfirm}
        onAccept={
          opponent === 'online' ? sendOnlineAcceptReset : advanceLocalMultiplayerRound
        }
        onDecline={
          opponent === 'online'
            ? sendOnlineDeclineReset
            : () => setShowLocalResetConfirm(false)
        }
        onCancelLocal={() => setShowLocalResetConfirm(false)}
      />

      {/* Theme Selector Modal */}
      <ThemeSelectorModal
        isOpen={showThemeModal}
        activeThemeId={themeId}
        onSelectTheme={(id) => {
          setThemeId(id);
          if (opponent === 'online' && roomState) {
            updateRoomSettings({ themeId: id });
          }
        }}
        onClose={() => setShowThemeModal(false)}
      />

      {/* Rules Modal */}
      <HowToPlayModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        initialMode={mode}
      />

      {/* Sleek Minimal Footer */}
      <footer className="w-full max-w-lg mx-auto py-1 px-3 text-center shrink-0">
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <span>
            Created by{' '}
            <span className="text-slate-400 font-semibold">Elshad Guliyev</span>
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/ell-shad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition-colors"
              title="GitHub Profile"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://www.linkedin.com/in/elshad-guliyev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition-colors"
              title="LinkedIn Profile"
            >
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
