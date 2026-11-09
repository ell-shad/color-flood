import type { Dispatch, SetStateAction } from 'react';
import { useState, useEffect } from 'react';
import type {
  ThemeId,
  GameMode,
  GridSize,
  ColorCount,
  BoardShape,
  MultiplayerOpponent,
  BotDifficulty,
  ChallengeType,
} from '../types';
import { loadBool, loadString, loadStringOr, saveString } from '../utils/storage';
import { parseBoardShape } from '../utils/boardShape';
import { isMuted, setMuted } from '../utils/soundEffects';

/**
 * P4.1: all persisted preferences, extracted from App.tsx.
 *
 * One hook owns: theme, mode/opponent/grids/bot difficulty/challengeType and
 * the two toggles. Reads go through the safe storage helper (P4.5) with legacy
 * migration; every change is persisted in a single effect per pref.
 *
 * `?room=` share links seed mode/opponent/lobby — same behavior as before.
 */
type DispatchBool = Dispatch<SetStateAction<boolean>>;

export interface Prefs {
  themeId: ThemeId;
  setThemeId: (t: ThemeId) => void;
  mode: GameMode;
  setMode: (m: GameMode) => void;
  gridSize: GridSize;
  setGridSize: (s: GridSize) => void;
  colorCount: ColorCount;
  setColorCount: (c: ColorCount) => void;
  /** P7: solo board topology; persisted so relaunched app keeps the wheel. */
  boardShape: BoardShape;
  setBoardShape: (s: BoardShape) => void;
  opponent: MultiplayerOpponent;
  setOpponent: (o: MultiplayerOpponent) => void;
  botDifficulty: BotDifficulty;
  setBotDifficulty: (d: BotDifficulty) => void;
  challengeType: ChallengeType;
  setChallengeType: (c: ChallengeType) => void;
  showTerritoryOverlay: boolean;
  setShowTerritoryOverlay: DispatchBool;
  /** P5.4: overlay digits (1..8) on every cell — a color-blind aid. */
  showColorSymbols: boolean;
  setShowColorSymbols: DispatchBool;
  showHints: boolean;
  setShowHints: DispatchBool;
  soundMuted: boolean;
  toggleSound: () => void;
  /** True when this page load arrived via a ?room= share link. */
  arrivedViaRoomLink: boolean;
}

export function usePrefs(): Prefs {
  const urlMode = new URLSearchParams(window.location.search).get('room');
  const arrivedViaRoomLink = !!urlMode;

  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = loadStringOr('theme', 'arcade', 'color-flood-theme');
    return (saved as ThemeId) || 'arcade';
  });

  const [mode, setMode] = useState<GameMode>(() => {
    if (urlMode) return 'multiplayer';
    return loadString('mode', 'color-flood-mode') === 'multiplayer'
      ? 'multiplayer'
      : 'solo';
  });

  const [gridSize, setGridSize] = useState<GridSize>(() => {
    const saved = loadString('grid-size', 'color-flood-grid-size');
    return saved ? (Number(saved) as GridSize) : 10;
  });

  const [colorCount, setColorCount] = useState<ColorCount>(() => {
    const saved = loadString('color-count', 'color-flood-color-count');
    return saved ? (Number(saved) as ColorCount) : 4;
  });

  const [boardShape, setBoardShape] = useState<BoardShape>(() => {
    // Unknown saved values fall back to the classic square (forward-compat).
    return parseBoardShape(loadString('board-shape', 'color-flood-board-shape'));
  });

  const [opponent, setOpponent] = useState<MultiplayerOpponent>(() => {
    if (urlMode) return 'online';
    return (
      (loadString('opponent', 'color-flood-opponent') as MultiplayerOpponent) || 'local'
    );
  });

  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => {
    return (loadString('bot-diff', 'color-flood-bot-diff') as BotDifficulty) || 'easy';
  });

  const [challengeType, setChallengeType] = useState<ChallengeType>(() => {
    return (
      (loadString('challenge-type', 'color-flood-challenge-type') as ChallengeType) ||
      'progressive'
    );
  });

  const [showTerritoryOverlay, setShowTerritoryOverlay] = useState<boolean>(() => {
    return loadString('overlay', 'color-flood-overlay') !== 'false';
  });

  const [showColorSymbols, setShowColorSymbols] = useState<boolean>(() => {
    return loadBool('color-symbols', false, 'color-flood-color-symbols');
  });

  const [showHints, setShowHints] = useState<boolean>(() => {
    return loadBool('show-hints', false, 'color-flood-show-hints');
  });

  const [soundMuted, setSoundMuted] = useState<boolean>(() => isMuted());

  // Persist every pref (safe storage: try/catch + versioned keys).
  useEffect(() => saveString('theme', themeId), [themeId]);
  useEffect(() => saveString('mode', mode), [mode]);
  useEffect(() => saveString('grid-size', String(gridSize)), [gridSize]);
  useEffect(() => saveString('color-count', String(colorCount)), [colorCount]);
  useEffect(() => saveString('board-shape', boardShape), [boardShape]);
  useEffect(() => saveString('opponent', opponent), [opponent]);
  useEffect(() => saveString('bot-diff', botDifficulty), [botDifficulty]);
  useEffect(() => saveString('challenge-type', challengeType), [challengeType]);
  useEffect(
    () => saveString('overlay', String(showTerritoryOverlay)),
    [showTerritoryOverlay],
  );
  useEffect(
    () => saveString('color-symbols', String(showColorSymbols)),
    [showColorSymbols],
  );
  useEffect(() => saveString('show-hints', String(showHints)), [showHints]);

  const toggleSound = () => {
    setSoundMuted((prev) => {
      setMuted(!prev);
      return !prev;
    });
  };

  return {
    themeId,
    setThemeId,
    mode,
    setMode,
    gridSize,
    setGridSize,
    colorCount,
    setColorCount,
    boardShape,
    setBoardShape,
    opponent,
    setOpponent,
    botDifficulty,
    setBotDifficulty,
    challengeType,
    setChallengeType,
    showTerritoryOverlay,
    setShowTerritoryOverlay,
    showColorSymbols,
    setShowColorSymbols,
    showHints,
    setShowHints,
    soundMuted,
    toggleSound,
    arrivedViaRoomLink,
  };
}
