export type GridSize = 10 | 12 | 14 | 16 | 18;
export type ColorCount = 4 | 5 | 6 | 7 | 8;
export type GameMode = 'solo' | 'multiplayer';
export type MultiplayerOpponent = 'local' | 'bot' | 'online';
export type BotDifficulty = 'easy' | 'medium' | 'master';
export type PlayerId = 1 | 2;
export type ChallengeType = 'standard' | 'progressive';

export type ThemeId =
  'arcade' | 'neon' | 'sunset' | 'pastel' | 'frost' | 'botanical' | 'jewel';

export interface GameTheme {
  id: ThemeId;
  name: string;
  colors: string[];
  colorNames: string[];
  boardBg: string;
  boardBorder: string;
  cellRadius: string;
  glowP1: string;
  glowP2: string;
}

export interface ResetProposal {
  requestedBy: 1 | 2;
  targetStage?: number;
  newGridSize?: number;
  newColorCount?: number;
  timestamp: number;
}

export interface SoloGameState {
  grid: number[][];
  moves: number;
  maxMoves: number;
  status: 'playing' | 'won' | 'lost';
  history: number[][][];
}

export interface TwoPlayerGameState {
  grid: number[][];
  turn: PlayerId;
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
  movesCount: number;
  status: 'playing' | 'p1_won' | 'p2_won' | 'draw';
  p1Moves: number;
  p2Moves: number;
  lastGains: { 1: number; 2: number };
  roundNumber: number;
  firstTurnPlayer: 1 | 2;
  challengeType: ChallengeType;
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  resetProposal: ResetProposal | null;
}

export interface OnlineRoomState {
  roomId: string;
  gridSize: number;
  colorCount: number;
  grid: number[][];
  turn: 1 | 2;
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
  status: 'waiting' | 'playing' | 'p1_won' | 'p2_won' | 'draw';
  p1Moves: number;
  p2Moves: number;
  movesCount: number;
  lastGains: { 1: number; 2: number };
  series: { p1: number; p2: number; draws: number };
  rematchRequestedBy: number | null;
  p1Name: string;
  p2Name: string | null;
  p1Connected: boolean;
  p2Connected: boolean;
  lastEmote?: { role: 1 | 2; emoji: string; id: number } | null;
  roundNumber: number;
  firstTurnPlayer: 1 | 2;
  challengeType: ChallengeType;
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  resetProposal: ResetProposal | null;
  themeId?: ThemeId;
  /** Optional per-turn move timer in seconds (0 = off). Host-configurable. */
  turnTimerSec?: 0 | 30 | 60;
}

export interface ActiveEmote {
  id: string;
  sender: 1 | 2;
  emoji: string;
  timestamp: number;
}

export interface HighScore {
  size: number;
  colors: number;
  moves: number;
}

export interface SeriesScore {
  p1: number;
  p2: number;
  draws: number;
}
