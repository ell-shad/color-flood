import { randomUUID } from 'crypto';
import {
  checkGameOverForShape,
  expandTerritoryForShape,
  generateBoardForShape,
} from '../src/utils/floodLogic';
import { buildMoveDiff } from '../src/utils/replay';
import { assertNever, shapeForMode } from '../src/utils/boardShape';
import { THEMES } from '../src/utils/themes';
import type {
  OnlineRoomState,
  ChallengeType,
  ResetProposal,
  ThemeId,
  BoardShape,
  TwoPlayerMoveRecord,
} from '../src/types';
import type { ServerMessage, RoomSnapshot, ServerErrorCode } from './protocol';

/**
 * Server-authoritative room service (Phase 3).
 *
 * Owns ALL room state. Clients send intents over the socket; every operation
 * authenticates via `playerToken` and derives the role server-side. No client
 * input ever writes game state directly.
 *
 * Sockets are NOT stored here: the ws layer binds a token to its socket and
 * forwards whatever the service emits. This keeps the service fully testable
 * without WebSockets.
 */

// --- Internal state ---------------------------------------------------------

export interface PlayerSession {
  id: string; // playerToken
  name: string;
  connected: boolean;
  lastSeen: number;
  /** When the socket dropped (grace countdown): 0 while connected. */
  disconnectedAt: number;
}

/** P6.6: a spectator seat — receive-only, no reseat lifecycle to manage. */
export interface SpectatorSession {
  id: string; // spectatorToken
  name: string;
}

export interface RoomInternal {
  roomId: string;
  version: number;
  gridSize: number;
  colorCount: number;
  /** P9: board topology for this room (fixed between rounds). */
  shape: BoardShape;
  p1: PlayerSession;
  p2: PlayerSession | null;
  /** P6.6: live spectator seats (receive snapshots, can never act). */
  spectators: SpectatorSession[];
  grid: number[][];
  turn: 1 | 2;
  firstTurnPlayer: 1 | 2;
  roundNumber: number;
  p1Cells: string[];
  p2Cells: string[];
  p1Color: number;
  p2Color: number;
  status: OnlineRoomState['status'];
  p1Moves: number;
  p2Moves: number;
  movesCount: number;
  lastGains: { 1: number; 2: number };
  series: { p1: number; p2: number; draws: number };
  rematchRequestedBy: 1 | 2 | null;
  resetProposal: ResetProposal | null;
  challengeType: ChallengeType;
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  themeId: ThemeId;
  lastActive: number;
  lastEmote: { role: 1 | 2; emoji: string; id: number } | null;
  /** Optional per-turn move timer: 0 (off) / 30 / 60. */
  turnTimerSec: 0 | 30 | 60;
  /** Server timestamp of the current turn's start. */
  turnStartedAt: number;
  /** P14: geometry seed for the randomized mosaic layout in this round. */
  boardSeed: number;
  /**
   * P10.4: one TwoPlayerMoveRecord per move of the CURRENT round. It is the
   * same recording format the local machines use, applied server-side (the
   * server is the replay authority for online rooms). Cleared on every new
   * round; shipped in snapshots only once the round has ended.
   */
  history: TwoPlayerMoveRecord[];
}

/** Disconnect grace before an idle player forfeits the current game. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Judging slack so a broadcast/in-flight move is not clipped by the timer. */
const TURN_TIMER_SLACK_MS = 1500;

/** Minimal storage seam (P3.6 may swap in a different backend). */
export interface RoomStore {
  get(roomId: string): RoomInternal | undefined;
  set(roomId: string, room: RoomInternal): void;
  delete(roomId: string): void;
  values(): IterableIterator<RoomInternal>;
}

export const createInMemoryStore = (): RoomStore => {
  const map = new Map<string, RoomInternal>();
  return {
    get: (id) => map.get(id),
    set: (id, room) => void map.set(id, room),
    delete: (id) => void map.delete(id),
    values: () => map.values(),
  };
};

// --- Service ----------------------------------------------------------------

const STAGE_CONFIGS: Record<number, { gridSize: number; colorCount: number }> = {
  1: { gridSize: 10, colorCount: 4 },
  2: { gridSize: 12, colorCount: 5 },
  3: { gridSize: 14, colorCount: 6 },
  4: { gridSize: 16, colorCount: 6 },
  5: { gridSize: 18, colorCount: 7 },
};

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const gridSizeValues = [10, 12, 14, 16, 18] as const;
const colorCountValues = [4, 5, 6, 7, 8] as const;

export interface BroadcastBus {
  /** Fan out a room-wide message (ws layer skips unbound sockets). */
  toRoom(roomId: string, message: ServerMessage): void;
  /** Direct reply to a token (or drop silently if that player has no socket). */
  toToken(token: string, message: ServerMessage): void;
}

export interface CreateRoomInput {
  playerName?: string;
  gridSize?: number;
  colorCount?: number;
  challengeType?: ChallengeType;
  shape?: BoardShape;
  themeId?: string;
  turnTimerSec?: 0 | 30 | 60;
}

/**
 * Simple, narrow-friendly operation result. Discriminated unions keep widening
 * `ok` to boolean under this project's non-strict tsconfig, so callers use a
 * single interface with optional detail fields instead.
 */
export interface RoomOpResult {
  ok: boolean;
  code?: ServerErrorCode;
  message?: string;
  /** join/resume results */
  roomId?: string;
  token?: string;
  role?: 1 | 2 | 'spectator';
  /** leave (host) */
  closed?: boolean;
  /** reset proposals */
  approved?: boolean;
  waiting?: boolean;
}

const err = (code: ServerErrorCode, message: string): RoomOpResult => ({
  ok: false,
  code,
  message,
});

export interface RoomService {
  createRoom(input: CreateRoomInput): { roomId: string; token: string; role: 1 };
  /**
   * P6.6: QUICK REMATCH — the host starts the next round instantly (as
   * progressive stage advance or same-config standby round). Opposing
   * consent is intentionally NOT needed: this is the host's call, and the
   * restart is broadcast so every seat (and spectators) snaps to it.
   */
  forceRematch(
    roomId: string,
    playerToken: string,
    opts: { targetStage?: number; newGridSize?: number; newColorCount?: number },
  ): RoomOpResult;
  joinRoom(
    roomId: string,
    playerName: string | undefined,
    playerToken?: string,
    spectator?: boolean,
  ): RoomOpResult;
  resume(roomId: string, playerToken: string): RoomOpResult;
  move(roomId: string, playerToken: string, color: number): RoomOpResult;
  proposeReset(
    roomId: string,
    playerToken: string,
    opts: { targetStage?: number; newGridSize?: number; newColorCount?: number },
  ): RoomOpResult;
  acceptReset(roomId: string, playerToken: string): RoomOpResult;
  declineReset(roomId: string, playerToken: string): RoomOpResult;
  updateSettings(
    roomId: string,
    playerToken: string,
    settings: {
      themeId?: string;
      gridSize?: number;
      colorCount?: number;
      challengeType?: ChallengeType;
      shape?: BoardShape;
      turnTimerSec?: 0 | 30 | 60;
    },
  ): RoomOpResult;
  leave(roomId: string, playerToken: string): RoomOpResult;
  emote(roomId: string, playerToken: string, emoji: string): RoomOpResult;
  /** Notify the service a socket dropped (marks disconnected, P3.5 adds grace). */
  socketClosed(playerToken: string): void;
  /**
   * P3.5: forfeit players who stayed disconnected past `graceMs` while a game
   * was running. Returns the number of rooms affected.
   */
  enforceDisconnects(graceMs?: number): number;
  /**
   * P3.5: forfeit the current player when the configured turn timer expires.
   * Returns the number of rooms affected.
   */
  enforceTurnTimers(): number;
  /** Read-only sanitized state (legacy REST transition + persistence checks). */
  readState(roomId: string): OnlineRoomState | null;
  /** Snapshot for a role (REST transition), or null. */
  snapshotFor(roomId: string, myRole: 1 | 2 | null): RoomSnapshot | null;
  /** Remove rooms idle beyond `maxIdleMs` (server calls periodically). */
  sweep(maxIdleMs: number): number;
  snapshot(room: RoomInternal, myRole: 1 | 2 | null): RoomSnapshot;
  activeRoomCount(): number;
}

export interface ServiceDeps {
  store?: RoomStore;
  bus: BroadcastBus;
  now?: () => number;
}

const sanitize = (room: RoomInternal): OnlineRoomState => {
  const state: OnlineRoomState = {
    roomId: room.roomId,
    gridSize: room.gridSize,
    colorCount: room.colorCount,
    shape: room.shape,
    grid: room.grid,
    turn: room.turn,
    firstTurnPlayer: room.firstTurnPlayer,
    roundNumber: room.roundNumber,
    p1Cells: room.p1Cells,
    p2Cells: room.p2Cells,
    p1Color: room.p1Color,
    p2Color: room.p2Color,
    status: room.status,
    boardSeed: room.boardSeed,
    p1Moves: room.p1Moves,
    p2Moves: room.p2Moves,
    movesCount: room.movesCount,
    lastGains: room.lastGains,
    series: room.series,
    rematchRequestedBy: room.rematchRequestedBy,
    resetProposal: room.resetProposal,
    /** Live spectator seat count. */
    spectatorCount: room.spectators.length,
    challengeType: room.challengeType,
    currentStage: room.currentStage,
    stageWins: room.stageWins,
    themeId: room.themeId,
    p1Name: room.p1.name,
    p2Name: room.p2 ? room.p2.name : null,
    p1Connected: room.p1.connected,
    p2Connected: room.p2 ? room.p2.connected : false,
    lastEmote: room.lastEmote,
    turnTimerSec: room.turnTimerSec,
  };
  // P10.4: the replay recording rides a snapshot only when the round has
  // ENDED (forfeits included—they change no cells, so the recording stays
  // consistent with the final board). Mid-game payloads stay lean, and the
  // history can never leak to the opponent before they finish playing.
  if (room.status === 'p1_won' || room.status === 'p2_won' || room.status === 'draw') {
    state.roundHistory = room.history;
  }
  return state;
};

export const createRoomService = (deps: ServiceDeps): RoomService => {
  const store = deps.store ?? createInMemoryStore();
  const now = deps.now ?? (() => Date.now());

  const bump = (room: RoomInternal) => {
    room.version += 1;
    room.lastActive = now();
    store.set(room.roomId, room);
  };

  const snapshot = (room: RoomInternal, myRole: 1 | 2 | null): RoomSnapshot => ({
    version: room.version,
    myRole,
    roomState: sanitize(room),
  });

  const stateMessage = (
    room: RoomInternal,
    type: Extract<ServerMessage, { snapshot: unknown }>['type'],
  ): ServerMessage =>
    ({
      type,
      snapshot: { version: room.version, myRole: null, roomState: sanitize(room) },
    }) as ServerMessage;

  const findRoom = (roomId: string) => store.get(roomId.toUpperCase());

  /** Unknown theme ids fall back to arcade instead of crashing the client lookup. */
  const validTheme = (id: string | undefined): ThemeId =>
    id && Object.hasOwn(THEMES, id) ? (id as ThemeId) : 'arcade';

  const playerByToken = (room: RoomInternal, token: string): 1 | 2 | null => {
    if (room.p1.id === token) return 1;
    if (room.p2 && room.p2.id === token) return 2;
    return null;
  };

  const auth = (
    roomId: string,
    token: string,
  ): { room: RoomInternal; role: 1 | 2 } | { error: ReturnType<typeof err> } => {
    const room = findRoom(roomId);
    if (!room) return { error: err('room_not_found', `Room "${roomId}" not found.`) };
    const role = playerByToken(room, token);
    if (!role) {
      return { error: err('not_authenticated', 'Invalid token for this room.') };
    }
    return { room, role };
  };

  const generateRoomCode = (): string => {
    const alphabet = ROOM_CODE_ALPHABET;
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      if (!store.get(code)) return code;
    }
    // 50 collisions on ~1B combinations is practically impossible.
    throw new Error('room code space exhausted');
  };

  const applyMoveToRoom = (room: RoomInternal, role: 1 | 2, color: number) => {
    const currentCells = role === 1 ? room.p1Cells : room.p2Cells;
    const opponentCells = role === 1 ? room.p2Cells : room.p1Cells;
    const { newGrid, newCells, gain } = expandTerritoryForShape(
      room.shape,
      room.grid,
      currentCells,
      opponentCells,
      color,
      room.boardSeed,
    );
    // P10.4: the round recording — same format as the local machines. The
    // diff must come off the PRE-move grid, and gained is the exact tail of
    // newCells after the previous territory (engines keep insertion order —
    // pinned by the replay contract tests).
    const diff = buildMoveDiff(room.grid, newGrid);
    const gained = newCells.slice(currentCells.length);
    if (role === 1) {
      room.p1Cells = newCells;
      room.p1Color = color;
      room.p1Moves += 1;
      room.lastGains[1] = gain;
    } else {
      room.p2Cells = newCells;
      room.p2Color = color;
      room.p2Moves += 1;
      room.lastGains[2] = gain;
    }
    room.grid = newGrid;
    room.movesCount += 1;
    room.turn = role === 1 ? 2 : 1;
    room.turnStartedAt = now();
    room.history.push({ player: role, color, diff, gained });

    const outcome = checkGameOverForShape(
      room.shape,
      room.grid,
      room.p1Cells,
      room.p2Cells,
      room.colorCount,
      room.p1Color,
      room.p2Color,
      room.boardSeed,
    );
    room.status = outcome;
    if (outcome === 'p1_won') {
      room.series.p1 += 1;
      if (!room.stageWins[1].includes(room.currentStage)) {
        room.stageWins[1].push(room.currentStage);
      }
    } else if (outcome === 'p2_won') {
      room.series.p2 += 1;
      if (!room.stageWins[2].includes(room.currentStage)) {
        room.stageWins[2].push(room.currentStage);
      }
    } else if (outcome === 'draw') {
      room.series.draws += 1;
    }
  };

  const executeNextRound = (
    room: RoomInternal,
    targetStage?: number,
    newGridSize?: number,
    newColorCount?: number,
  ) => {
    room.roundNumber += 1;
    const nextFirst = room.firstTurnPlayer === 1 ? 2 : 1;
    room.firstTurnPlayer = nextFirst;
    room.turn = nextFirst;
    room.turnStartedAt = now();

    if (room.challengeType === 'progressive') {
      if (targetStage !== undefined) {
        room.currentStage = targetStage;
      } else if (room.status !== 'playing' && room.status !== 'waiting') {
        room.currentStage = Math.min(5, room.currentStage + 1);
      }
      const stageConf = STAGE_CONFIGS[room.currentStage] ?? STAGE_CONFIGS[1];
      room.gridSize = stageConf.gridSize;
      room.colorCount = stageConf.colorCount;
    } else {
      if (newGridSize !== undefined) room.gridSize = newGridSize;
      if (newColorCount !== undefined) room.colorCount = newColorCount;
    }

    const boardSeed = Math.floor(Math.random() * 2 ** 32);
    const board = generateBoardForShape(
      room.shape,
      room.gridSize,
      room.colorCount,
      undefined,
      boardSeed,
    );
    room.boardSeed = boardSeed;
    room.grid = board.grid;
    room.p1Cells = board.p1Cells;
    room.p2Cells = board.p2Cells;
    room.p1Color = board.p1Color;
    room.p2Color = board.p2Color;
    room.status = 'playing';
    room.p1Moves = 0;
    room.p2Moves = 0;
    room.movesCount = 0;
    room.lastGains = { 1: 0, 2: 0 };
    // P10.4: the finished round's recording goes with it — the next round
    // starts recording empty.
    room.history = [];
    room.rematchRequestedBy = null;
    room.resetProposal = null;
  };

  return {
    createRoom(input) {
      const roomId = generateRoomCode();
      const token = randomUUID();
      const isProgressive = input.challengeType === 'progressive';
      const gridSize = isProgressive
        ? STAGE_CONFIGS[1].gridSize
        : (gridSizeValues as readonly number[]).includes(input.gridSize ?? 10)
          ? (input.gridSize ?? 10)
          : 10;
      const colorCount = isProgressive
        ? STAGE_CONFIGS[1].colorCount
        : (colorCountValues as readonly number[]).includes(input.colorCount ?? 4)
          ? (input.colorCount ?? 4)
          : 4;

      let shape: BoardShape;
      switch (input.shape) {
        case 'classic':
          shape = 'classic';
          break;
        case 'wheel':
          shape = 'wheel';
          break;
        // The cube surface is solo-only, so a room never hosts one: an old
        // client asking for it gets the flat board instead of a dead room.
        case 'cube':
        case undefined:
          shape = 'classic';
          break;
        case 'mosaic':
          shape = 'mosaic';
          break;
        case 'triangle':
          shape = 'triangle';
          break;
        case 'hive':
          shape = 'hive';
          break;
        default:
          assertNever(input.shape as never);
          break;
      }
      const boardSeed = Math.floor(Math.random() * 2 ** 32);
      const board = generateBoardForShape(
        shape,
        gridSize,
        colorCount,
        undefined,
        boardSeed,
      );
      const room: RoomInternal = {
        roomId,
        version: 1,
        gridSize,
        colorCount,
        shape,
        boardSeed,
        p1: {
          id: token,
          name: input.playerName?.trim() || 'Player 1',
          connected: true,
          disconnectedAt: 0,
          lastSeen: now(),
        },
        p2: null,
        spectators: [],
        grid: board.grid,
        turn: 1,
        firstTurnPlayer: 1,
        roundNumber: 1,
        p1Cells: board.p1Cells,
        p2Cells: board.p2Cells,
        p1Color: board.p1Color,
        p2Color: board.p2Color,
        status: 'waiting',
        p1Moves: 0,
        p2Moves: 0,
        movesCount: 0,
        lastGains: { 1: 0, 2: 0 },
        // P10.4: rounds start with nothing to replay.
        history: [],
        series: { p1: 0, p2: 0, draws: 0 },
        rematchRequestedBy: null,
        resetProposal: null,
        challengeType: isProgressive ? 'progressive' : 'standard',
        currentStage: 1,
        stageWins: { 1: [], 2: [] },
        themeId: validTheme(input.themeId),
        lastActive: now(),
        lastEmote: null,
        turnTimerSec: (input.turnTimerSec ?? 0) as 0 | 30 | 60,
        turnStartedAt: now(),
      };
      store.set(roomId, room);
      return { roomId, token, role: 1 };
    },

    joinRoom(roomId, playerName, playerToken, spectator) {
      const room = findRoom(roomId);
      if (!room) return err('room_not_found', `Room "${roomId}" not found.`);

      // Token reconnects keep their original role (P3.7: role is derived, never claimed).
      if (playerToken) {
        const role = playerByToken(room, playerToken);
        if (role) {
          const session = role === 1 ? room.p1 : room.p2!;
          session.connected = true;
          session.disconnectedAt = 0;
          session.lastSeen = now();
          if (playerName?.trim()) session.name = playerName.trim();
          bump(room);
          return { ok: true, roomId: room.roomId, token: playerToken, role };
        }
      }

      // P6.6: spectator seats never occupy the 2-player slots and exist on
      // full rooms too. A dropped spectator seat is simply erased (no grace
      // countdown — spectators have nothing to forfeit).
      if (spectator) {
        if (playerToken) {
          const existing = room.spectators.find((s) => s.id === playerToken);
          if (existing) {
            if (playerName?.trim()) existing.name = playerName.trim();
            bump(room);
            return {
              ok: true,
              roomId: room.roomId,
              token: playerToken,
              role: 'spectator',
            };
          }
        }
        const token = randomUUID();
        room.spectators.push({
          id: token,
          name: playerName?.trim() || 'Spectator',
        });
        bump(room);
        return { ok: true, roomId: room.roomId, token, role: 'spectator' };
      }

      if (room.p2) {
        return err(
          'room_full',
          `Room "${roomId}" is full. There are already 2 players in this match.`,
        );
      }

      const token = randomUUID();
      room.p2 = {
        id: token,
        name: playerName?.trim() || 'Player 2',
        connected: true,
        disconnectedAt: 0,
        lastSeen: now(),
      };
      room.status = 'playing';
      bump(room);
      // Everyone with a bound socket sees the match start (the joiner's ack is
      // sent by the transport layer right after binding).
      deps.bus.toRoom(room.roomId, {
        type: 'match_started',
        snapshot: { version: room.version, myRole: null, roomState: sanitize(room) },
      });
      return { ok: true, roomId: room.roomId, token, role: 2 };
    },

    resume(roomId, playerToken) {
      const room = findRoom(roomId);
      if (!room) return err('room_not_found', `Room "${roomId}" not found.`);
      const role = playerByToken(room, playerToken);
      if (!role) {
        // P6.6: a reconnecting spectator keeps its receive-only seat.
        const spectatorIdx = room.spectators.findIndex((s) => s.id === playerToken);
        if (spectatorIdx === -1) {
          return err('not_authenticated', 'Invalid token for this room.');
        }
        return { ok: true, roomId: room.roomId, token: playerToken, role: 'spectator' };
      }
      const session = role === 1 ? room.p1 : room.p2!;
      session.connected = true;
      session.disconnectedAt = 0;
      session.lastSeen = now();
      bump(room);
      return { ok: true, roomId: room.roomId, token: playerToken, role };
    },

    move(roomId, playerToken, color) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      if (room.status !== 'playing') {
        return err('not_active', 'Game is not active.');
      }
      if (room.turn !== role) {
        return err('not_your_turn', 'Not your turn.');
      }
      if (
        !Number.isInteger(color) ||
        color < 0 ||
        color >= room.colorCount ||
        color === room.p1Color ||
        color === room.p2Color
      ) {
        return err('bad_color', 'Illegal color.');
      }
      applyMoveToRoom(room, role, color);
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'move_made'));
      return { ok: true };
    },

    proposeReset(roomId, playerToken, opts) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      const settingsBias = opts.targetStage ?? opts.newGridSize ?? opts.newColorCount;

      // Opponent already waiting → auto-accept (mutual rematch).
      if (room.rematchRequestedBy !== null && room.rematchRequestedBy !== role) {
        if (room.status !== 'playing' || settingsBias !== undefined) {
          executeNextRound(room, opts.targetStage, opts.newGridSize, opts.newColorCount);
          bump(room);
          deps.bus.toRoom(room.roomId, stateMessage(room, 'reset_accepted'));
          return { ok: true, approved: true };
        }
      }

      const proposal: ResetProposal = {
        requestedBy: role,
        targetStage: opts.targetStage,
        newGridSize: opts.newGridSize,
        newColorCount: opts.newColorCount,
        timestamp: now(),
      };
      room.resetProposal = proposal;
      room.rematchRequestedBy = role;
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'reset_proposed'));
      return { ok: true, waiting: true };
    },

    acceptReset(roomId, playerToken) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      // P3.2 fix: legacy /accept-reset executed a new round without any proposal.
      if (!room.resetProposal) {
        return err('no_proposal', 'No reset proposal to accept.');
      }
      if (room.resetProposal.requestedBy === role && room.rematchRequestedBy === role) {
        return err('no_proposal', 'Wait for your opponent to accept.');
      }
      const p = room.resetProposal;
      executeNextRound(room, p.targetStage, p.newGridSize, p.newColorCount);
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'reset_accepted'));
      return { ok: true };
    },

    forceRematch(roomId, playerToken, opts) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      if (role !== 1) {
        return err('host_only', 'Only the host can start a rematch directly.');
      }
      if (room.status === 'playing' || room.status === 'waiting') {
        return err('not_active', 'The match is not over yet.');
      }
      executeNextRound(room, opts.targetStage, opts.newGridSize, opts.newColorCount);
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'reset_accepted'));
      return { ok: true, approved: true };
    },

    declineReset(roomId, playerToken) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room } = a;
      room.resetProposal = null;
      room.rematchRequestedBy = null;
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'reset_declined'));
      return { ok: true };
    },

    updateSettings(roomId, playerToken, settings) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      // Cosmetic theme changes are always allowed by either player.
      if (settings.themeId !== undefined) {
        room.themeId = validTheme(settings.themeId);
      }
      if (settings.turnTimerSec !== undefined) {
        // Timer is board-safe, so the host may adjust it any time.
        if (role !== 1) {
          return err('settings_locked', 'Only the host can change the turn timer.');
        }
        room.turnTimerSec = settings.turnTimerSec;
        room.turnStartedAt = Math.max(room.turnStartedAt, now());
      }
      const structural =
        settings.gridSize !== undefined ||
        settings.colorCount !== undefined ||
        settings.challengeType !== undefined ||
        settings.shape !== undefined;
      if (structural) {
        // Lobby-only (or after a round ended): mid-game changes corrupt the board.
        if (room.status === 'playing') {
          // Theme-only edit was applied; reject the structural part as a whole op.
          return err('settings_locked', 'Board settings can only change between games.');
        }
        if (role !== 1) {
          return err('settings_locked', 'Only the host can change match settings.');
        }
        if (settings.challengeType !== undefined)
          room.challengeType = settings.challengeType;
        // Same solo-only rule as createRoom: a multiplayer room stays flat.
        if (settings.shape !== undefined)
          room.shape = shapeForMode(settings.shape, 'multiplayer');
        if (room.challengeType === 'standard') {
          if (settings.gridSize !== undefined) room.gridSize = settings.gridSize;
          if (settings.colorCount !== undefined) room.colorCount = settings.colorCount;
        } else if (room.status === 'waiting') {
          room.currentStage = 1;
          room.gridSize = STAGE_CONFIGS[1].gridSize;
          room.colorCount = STAGE_CONFIGS[1].colorCount;
        }
        if (room.status === 'waiting') {
          const boardSeed = Math.floor(Math.random() * 2 ** 32);
          const board = generateBoardForShape(
            room.shape,
            room.gridSize,
            room.colorCount,
            undefined,
            boardSeed,
          );
          room.boardSeed = boardSeed;
          room.grid = board.grid;
          room.p1Cells = board.p1Cells;
          room.p2Cells = board.p2Cells;
          room.p1Color = board.p1Color;
          room.p2Color = board.p2Color;
        }
      }
      bump(room);
      deps.bus.toRoom(room.roomId, stateMessage(room, 'settings_updated'));
      return { ok: true };
    },

    leave(roomId, playerToken) {
      const room = findRoom(roomId);
      if (!room) return err('room_not_found', `Room "${roomId}" not found.`);

      // P6.6: a spectator leaving just erases the seat; players use auth().
      const spectatorIdx = room.spectators.findIndex((s) => s.id === playerToken);
      if (spectatorIdx !== -1) {
        room.spectators.splice(spectatorIdx, 1);
        bump(room);
        deps.bus.toRoom(room.roomId, stateMessage(room, 'player_left'));
        return { ok: true };
      }

      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room: joinRoomState, role } = a;
      if (role === 1) {
        deps.bus.toRoom(joinRoomState.roomId, {
          type: 'player_left',
          snapshot: {
            version: joinRoomState.version,
            myRole: null,
            roomState: sanitize(joinRoomState),
          },
        });
        store.delete(joinRoomState.roomId);
        return { ok: true, closed: true };
      }
      joinRoomState.p2 = null;
      joinRoomState.status = 'waiting';
      joinRoomState.rematchRequestedBy = null;
      joinRoomState.resetProposal = null;
      bump(joinRoomState);
      deps.bus.toRoom(joinRoomState.roomId, stateMessage(joinRoomState, 'player_left'));
      return { ok: true };
    },

    emote(roomId, playerToken, emoji) {
      const a = auth(roomId, playerToken);
      if ('error' in a) return a.error;
      const { room, role } = a;
      const emotePayload = {
        role,
        emoji: emoji.slice(0, 10),
        id: now(),
      };
      room.lastEmote = emotePayload;
      bump(room);
      deps.bus.toRoom(room.roomId, {
        type: 'player_emote',
        emote: emotePayload,
      });
      return { ok: true };
    },

    socketClosed(playerToken) {
      for (const room of store.values()) {
        const role = playerByToken(room, playerToken);
        if (role) {
          const session = role === 1 ? room.p1 : room.p2;
          if (!session || session.id !== playerToken) continue;
          session.connected = false;
          session.disconnectedAt = now();
          session.lastSeen = now();
          bump(room);
          deps.bus.toRoom(room.roomId, stateMessage(room, 'player_disconnected'));
          return;
        }
        // Spectators have nothing to forfeit: their seat evaporates on drop.
        const spectatorIdx = room.spectators.findIndex((s) => s.id === playerToken);
        if (spectatorIdx !== -1) {
          room.spectators.splice(spectatorIdx, 1);
          bump(room);
          deps.bus.toRoom(room.roomId, stateMessage(room, 'player_left'));
          return;
        }
      }
    },

    enforceDisconnects(graceMs = DISCONNECT_GRACE_MS) {
      const t = now();
      let affected = 0;
      for (const room of store.values()) {
        if (room.status !== 'playing') continue;
        const p1TimedOut =
          !room.p1.connected &&
          room.p1.disconnectedAt > 0 &&
          t - room.p1.disconnectedAt > graceMs;
        const p2TimedOut =
          room.p2 !== null &&
          !room.p2.connected &&
          room.p2.disconnectedAt > 0 &&
          t - room.p2.disconnectedAt > graceMs;
        if (!p1TimedOut && !p2TimedOut) continue;
        const droppedRole: 1 | 2 = p1TimedOut ? 1 : 2;
        const winner: OnlineRoomState['status'] = droppedRole === 1 ? 'p2_won' : 'p1_won';
        room.status = winner;
        // Series credit for the winner (forfeit is a loss for the dropped player).
        if (winner === 'p1_won') {
          room.series.p1 += 1;
          if (!room.stageWins[1].includes(room.currentStage)) {
            room.stageWins[1].push(room.currentStage);
          }
        } else {
          room.series.p2 += 1;
          if (!room.stageWins[2].includes(room.currentStage)) {
            room.stageWins[2].push(room.currentStage);
          }
        }
        room.rematchRequestedBy = null;
        room.resetProposal = null;
        const dropped = droppedRole === 1 ? room.p1 : room.p2!;
        dropped.disconnectedAt = 0;
        bump(room);
        deps.bus.toRoom(room.roomId, stateMessage(room, 'state_update'));
        affected++;
      }
      return affected;
    },

    enforceTurnTimers() {
      const t = now();
      let affected = 0;
      for (const room of store.values()) {
        if (
          room.status !== 'playing' ||
          room.turnTimerSec === 0 ||
          t - room.turnStartedAt <= room.turnTimerSec * 1000 + TURN_TIMER_SLACK_MS
        ) {
          continue;
        }
        const loser = room.turn;
        room.status = loser === 1 ? 'p2_won' : 'p1_won';
        if (room.status === 'p1_won') {
          room.series.p1 += 1;
          if (!room.stageWins[1].includes(room.currentStage)) {
            room.stageWins[1].push(room.currentStage);
          }
        } else {
          room.series.p2 += 1;
          if (!room.stageWins[2].includes(room.currentStage)) {
            room.stageWins[2].push(room.currentStage);
          }
        }
        room.rematchRequestedBy = null;
        room.resetProposal = null;
        bump(room);
        deps.bus.toRoom(room.roomId, stateMessage(room, 'state_update'));
        affected++;
      }
      return affected;
    },

    sweep(maxIdleMs) {
      const t = now();
      let removed = 0;
      for (const room of store.values()) {
        if (t - room.lastActive > maxIdleMs) {
          store.delete(room.roomId);
          removed++;
        }
      }
      return removed;
    },

    snapshot,
    activeRoomCount: () => {
      let n = 0;
      for (const _ of store.values()) n++;
      return n;
    },
    readState: (roomId) => {
      const room = store.get(roomId.toUpperCase());
      return room ? sanitize(room) : null;
    },
    snapshotFor: (roomId, myRole) => {
      const room = store.get(roomId.toUpperCase());
      return room ? snapshot(room, myRole) : null;
    },
  };
};
