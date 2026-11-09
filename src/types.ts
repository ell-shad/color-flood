export type GridSize = 10 | 12 | 14 | 16 | 18;
export type ColorCount = 4 | 5 | 6 | 7 | 8;
/** P7/P11/P13: solo board topology — square, polar wheel, cube surface or mosaic. */
export type BoardShape = 'classic' | 'wheel' | 'cube' | 'mosaic';
export type GameMode = 'solo' | 'multiplayer';
export type MultiplayerOpponent = 'local' | 'bot' | 'online';
export type BotDifficulty = 'easy' | 'medium' | 'master';
export type PlayerId = 1 | 2;
export type ChallengeType = 'standard' | 'progressive';

export type ThemeId =
  | 'arcade'
  | 'neon'
  | 'sunset'
  | 'pastel'
  | 'frost'
  | 'botanical'
  | 'jewel'
  | 'colorblind'
  | 'emoji';

export interface GameTheme {
  id: ThemeId;
  name: string;
  colors: string[];
  colorNames: string[];
  /**
   * Optional per-slot emoji: when present, every cell shows its color as an
   * emoji (red heart, ocean wave, …) instead of a palette digit.
   */
  emoji?: string[];
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

/** P5.6: one repaint entry of a solo move — enough to undo the flood exactly. */
export interface SoloMoveDiff {
  r: number;
  c: number;
  /** Board color at (r, c) before the move repainted it. */
  prev: number;
}

/**
 * P10.1: one recorded two-player move — enough to replay the round exactly
 * from the final board alone. `diff` repaints hold the previous grid colors
 * and `gained` holds the territory keys this move added to the mover's land
 * (territory only ever grows, so ownership also rebuilds backward).
 */
export interface TwoPlayerMoveRecord {
  /** Who played it (the local reducer's turn order; the server's role). */
  player: PlayerId;
  /** Palette index the mover played. */
  color: number;
  /** Cells the move repainted (cell + previous color), the P5.6 format. */
  diff: SoloMoveDiff[];
  /** Territory keys that joined the mover's land with this move, in order. */
  gained: string[];
}

export interface SoloGameState {
  grid: number[][];
  moves: number;
  maxMoves: number;
  status: 'playing' | 'won' | 'lost';
  /** P7: board topology — `classic` square or `wheel` (rings × sectors). */
  shape: BoardShape;
  /** Per-move repaint diffs; index 0 is the initial board (empty diff). */
  history: SoloMoveDiff[][];
  /** P6.1: winning-move replay material — the played palette indices in order. */
  playedColors: number[];
  /** P6.3: seed that generated this board (every board is now seeded —
   * random play draws a seed from Math.random so games stay shareable). */
  seed: number;
  /** P6.3: palette width chosen at generation (share links; size = grid.length). */
  boardColors: number;
  /** P7.3: ladder size (10–18) that generated the board — wheel grids are
   * rings × sectors, so grid.length is NOT the difficulty size. */
  boardSize: GridSize;
}

export interface TwoPlayerGameState {
  grid: number[][];
  /** P9: board topology — classic square or the polar wheel (2P too). */
  shape: BoardShape;
  /** P10.1: ladder size the round was generated from (wheel geometry reads it). */
  boardSize: GridSize;
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
  /**
   * P10.1: one `TwoPlayerMoveRecord` per played move. Unlike the solo machine
   * there is no padding entry at index 0 — index i is the i-th physical move.
   */
  history: TwoPlayerMoveRecord[];
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
  /** P9: board topology. Optional so pre-wheel snapshots stay readable. */
  shape?: BoardShape;
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
  /** How many live spectator sessions are watching right now. */
  spectatorCount: number;
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
  /**
   * P10.4: one `TwoPlayerMoveRecord` per move of the finished round. The
   * server attaches it to a snapshot only once the round has actually ended,
   * so mid-game payloads stay lean; absent while a round is running.
   */
  roundHistory?: TwoPlayerMoveRecord[];
}

export interface ActiveEmote {
  id: string;
  sender: 1 | 2;
  emoji: string;
  timestamp: number;
}

export interface HighScore {
  /** P7.3: topology the record belongs to (wheels rate on their own par). */
  shape: BoardShape;
  size: number;
  colors: number;
  moves: number;
}

export interface SeriesScore {
  p1: number;
  p2: number;
  draws: number;
}
