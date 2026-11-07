import { useState, useEffect, useRef, useCallback } from 'react';
import { OnlineRoomState, ChallengeType, ResetProposal, ThemeId, BoardShape } from '../types';
import {
  checkGameOverForShape,
  expandTerritoryForShape,
  generateBoardForShape,
} from './floodLogic';
import type { ServerMessage } from '../../server/protocol';
import { z } from 'zod';
import { loadJson, removeKey, saveJson } from './storage';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // matches the server's room GC window

/** P4.5: the session goes through the safe, zod-validated storage helper. */
const StoredSessionSchema = z.object({
  roomId: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^[A-Z0-9]+$/),
  token: z.string().min(8).max(64),
  expiresAt: z.number().finite(),
});
type StoredSession = z.infer<typeof StoredSessionSchema>;

const loadSession = (): StoredSession | null => {
  const stored = loadJson('session', StoredSessionSchema, 'color-flood-online-session');
  if (!stored) return null;
  // Explicit TTL check (the schema validates the shape, not liveness).
  if (stored.expiresAt < Date.now()) {
    removeKey('session');
    return null;
  }
  return stored;
};

/** Exported for App's `?room=` deep link (share the exact storage format). */
export const loadStoredSession = loadSession;

const saveSession = (roomId: string | null, token: string | null) => {
  if (roomId && token) {
    saveJson('session', {
      roomId,
      token,
      expiresAt: Date.now() + SESSION_TTL_MS,
    } satisfies StoredSession);
  } else {
    removeKey('session');
  }
};

/**
 * Online multiplayer hook (Phase 3): ONE server-authoritative WebSocket protocol.
 *
 * - No PeerJS, no REST polling, no local game simulation except optimistic
 *   previews that the server's (versioned) snapshots override.
 * - Every state snapshot carries a monotonic `version`; stale ones are dropped.
 * - Rejected intents trigger an automatic re-sync (`resume`) so the UI can never
 *   wedge on an optimistic update.
 * - P3.5: sessions survive a full page refresh — { roomId, token } persists in
 *   localStorage with a TTL and auto-resumes on mount.
 */
export function useOnlineMultiplayer() {
  const [roomState, setRoomState] = useState<OnlineRoomState | null>(null);
  const [myRole, setMyRole] = useState<1 | 2 | null>(null);
  /** P6.6: true while bound to a seat that watches instead of playing. */
  const [isSpectator, setIsSpectator] = useState(false);
  /** P6.6: protocol-level code of the last error (lobby reacts to room_full). */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const playerTokenRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const versionRef = useRef<number>(0);
  const myRoleRef = useRef<1 | 2 | null>(null);
  const roomStateRef = useRef<OnlineRoomState | null>(null);
  const onEmoteCallbackRef = useRef<((role: 1 | 2, emoji: string) => void) | null>(null);
  const lastEmoteIdRef = useRef<number>(0);
  const intentionalCloseRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  /** Latest `connect` (ws.onclose must reach it without a TDZ self-reference). */
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    myRoleRef.current = myRole;
  }, [myRole]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(
    () => () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      // Detach synchronously so a dev StrictMode remount's resume effect can
      // create a fresh socket instead of early-returning on a closing one.
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    },
    [],
  );

  // --- Socket plumbing -------------------------------------------------------

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.warn('Failed to send protocol message:', err);
      }
    }
  }, []);

  /** Re-sync after an optimistic update was rejected or a drop happened. */
  const resync = useCallback(() => {
    if (playerTokenRef.current && roomIdRef.current) {
      send({
        type: 'resume',
        roomId: roomIdRef.current,
        playerToken: playerTokenRef.current,
      });
    }
  }, [send]);

  const applySnapshot = useCallback(
    (snapshot: { version: number; roomState: OnlineRoomState }) => {
      // Monotonic gate: the server increments on every mutation; optimistic local
      // patches use fractional versions so real snapshots always win.
      if (snapshot.version <= versionRef.current) return;
      versionRef.current = snapshot.version;
      setRoomState(snapshot.roomState);
    },
    [],
  );

  const handleEmote = useCallback((emote: { role: 1 | 2; emoji: string; id: number }) => {
    if (emote.id > lastEmoteIdRef.current) {
      lastEmoteIdRef.current = emote.id;
      if (emote.role !== myRoleRef.current && onEmoteCallbackRef.current) {
        onEmoteCallbackRef.current(emote.role, emote.emoji);
      }
    }
  }, []);

  const routeMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'pong': {
          return;
        }
        case 'room_created':
        case 'room_joined':
        case 'resumed': {
          if (msg.type !== 'resumed') {
            versionRef.current = 0;
          }
          playerTokenRef.current = msg.playerToken;
          roomIdRef.current = msg.roomId;
          const ackRole = msg.role;
          const watching = ackRole === 'spectator';
          setIsSpectator(watching);
          setMyRole(watching ? null : ackRole);
          myRoleRef.current = watching ? null : ackRole;
          intentionalCloseRef.current = false;
          reconnectAttemptsRef.current = 0;
          setErrorCode(null);
          setConnectionStatus('connected');
          setErrorMessage(null);
          // Spectator seats are deliberately NOT persisted: a refresh re-enters
          // through the room link (and never resurrects a playing session).
          if (!watching) saveSession(msg.roomId, msg.playerToken);
          applySnapshot(msg.snapshot);
          return;
        }
        case 'state_update':
        case 'match_started':
        case 'move_made':
        case 'reset_proposed':
        case 'reset_declined':
        case 'settings_updated':
        case 'player_disconnected':
        case 'player_left': {
          applySnapshot(msg.snapshot);
          return;
        }
        case 'reset_accepted': {
          applySnapshot(msg.snapshot);
          const next = msg.snapshot.roomState;
          setSystemMessage(
            `Round ${next.roundNumber} — Player ${next.firstTurnPlayer} starts!`,
          );
          return;
        }
        case 'player_emote': {
          handleEmote(msg.emote);
          return;
        }
        case 'error': {
          setErrorCode(msg.code);
          // Auth failures mean the session is gone (expired room, new host, GC):
          // drop the stored session instead of looping a resume that cannot win.
          if (msg.code === 'not_authenticated' || msg.code === 'room_not_found') {
            if (msg.code === 'not_authenticated') {
              saveSession(null, null);
              roomIdRef.current = null;
              playerTokenRef.current = null;
              setMyRole(null);
              myRoleRef.current = null;
              setIsSpectator(false);
              setConnectionStatus('disconnected');
              setSystemMessage(null);
            }
            setErrorMessage(msg.message);
            return;
          }
          // A full room is surfaced as-is (the lobby offers the spectator seat),
          // and — with no binding yet — re-syncing would be a no-op anyway.
          if (msg.code === 'room_full') {
            setErrorMessage(msg.message);
            return;
          }
          // Rejected intent: surface it and re-sync to a server-confirmed state.
          setErrorMessage(msg.message);
          resync();
          return;
        }
        default:
          return;
      }
    },
    [applySnapshot, handleEmote, resync],
  );

  const connect = useCallback(() => {
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setConnectionStatus('error');
      setErrorMessage('Could not open connection.');
      return;
    }
    wsRef.current = ws;
    setConnectionStatus('connecting');

    ws.onmessage = (event) => {
      try {
        const msg: unknown = JSON.parse(String(event.data));
        if (
          typeof msg === 'object' &&
          msg !== null &&
          typeof (msg as { type?: unknown }).type === 'string'
        ) {
          routeMessage(msg as ServerMessage);
        }
      } catch {
        /* non-JSON frame: ignore */
      }
    };

    ws.onopen = () => {
      // After a reconnect, the existing session is resumed by token.
      resync();
    };

    ws.onclose = () => {
      // Detach only when this socket is still the active one — a late close of
      // a superseded socket must never unset the live connection.
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        setConnectionStatus('disconnected');
        return;
      }
      if (roomIdRef.current && playerTokenRef.current) {
        // Reconnect with backoff; the server keeps the room for dropped players.
        reconnectAttemptsRef.current += 1;
        if (reconnectAttemptsRef.current > 8) {
          setConnectionStatus('error');
          setErrorMessage('Connection lost. Please rejoin.');
          return;
        }
        const backoff = Math.min(3000, 250 * 2 ** reconnectAttemptsRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          setConnectionStatus('connecting');
          connectRef.current();
        }, backoff);
        setSystemMessage('Reconnecting…');
      } else {
        setConnectionStatus('disconnected');
      }
    };

    ws.onerror = () => {
      /* close handler manages recovery */
    };
  }, [resync, routeMessage]);

  // Keep the reconnect pointer fresh (declared BEFORE the resume effect so the
  // ref is set on mount before any connect call).
  useEffect(() => {
    connectRef.current = connect;
  });

  // P3.5: resume a stored session after a full page refresh.
  useEffect(() => {
    if (wsRef.current) return; // an active connection resumes itself on open
    const stored = loadSession();
    if (!stored) return;
    roomIdRef.current = stored.roomId;
    playerTokenRef.current = stored.token;
    // Kick off the external system (WebSocket). The synchronous status
    // transition inside connect() is intentional — the UI must render
    // 'connecting' before the handshake resolves — so this one call is
    // exempted; every other set-state-in-effect is an error now.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
  }, [connect]);

  // --- Optimistic updates (ported from the legacy hook) ----------------------

  const optimisticMove = (fromRole: 1 | 2, color: number) => {
    setRoomState((prev) => {
      if (!prev) return null;
      const currentCells = fromRole === 1 ? prev.p1Cells : prev.p2Cells;
      const opponentCells = fromRole === 1 ? prev.p2Cells : prev.p1Cells;

      const { newGrid, newCells, gain } = expandTerritoryForShape(
        prev.shape ?? 'classic',
        prev.grid,
        currentCells,
        opponentCells,
        color,
      );

      const nextP1Cells = fromRole === 1 ? newCells : prev.p1Cells;
      const nextP2Cells = fromRole === 2 ? newCells : prev.p2Cells;
      const nextP1Color = fromRole === 1 ? color : prev.p1Color;
      const nextP2Color = fromRole === 2 ? color : prev.p2Color;

      const outcome = checkGameOverForShape(
        prev.shape ?? 'classic',
        newGrid,
        nextP1Cells,
        nextP2Cells,
        prev.colorCount,
        nextP1Color,
        nextP2Color,
      );

      const series = { ...prev.series };
      const stageWins = {
        1: [...prev.stageWins[1]],
        2: [...prev.stageWins[2]],
      };

      if (outcome !== 'playing' && prev.status === 'playing') {
        if (outcome === 'p1_won') {
          series.p1 += 1;
          if (
            prev.challengeType === 'progressive' &&
            !stageWins[1].includes(prev.currentStage)
          ) {
            stageWins[1].push(prev.currentStage);
          }
        } else if (outcome === 'p2_won') {
          series.p2 += 1;
          if (
            prev.challengeType === 'progressive' &&
            !stageWins[2].includes(prev.currentStage)
          ) {
            stageWins[2].push(prev.currentStage);
          }
        } else if (outcome === 'draw') {
          series.draws += 1;
        }
      }

      versionRef.current += 0.5; // optimistic; server snapshots override
      return {
        ...prev,
        grid: newGrid,
        turn: fromRole === 1 ? 2 : 1,
        p1Cells: nextP1Cells,
        p2Cells: nextP2Cells,
        p1Color: nextP1Color,
        p2Color: nextP2Color,
        movesCount: prev.movesCount + 1,
        p1Moves: fromRole === 1 ? prev.p1Moves + 1 : prev.p1Moves,
        p2Moves: fromRole === 2 ? prev.p2Moves + 1 : prev.p2Moves,
        status: outcome,
        series,
        stageWins,
        lastGains: {
          ...prev.lastGains,
          [fromRole]: gain,
        },
      };
    });
  };

  // --- Public API (signatures preserved) -------------------------------------

  const createRoom = useCallback(
    async (
      playerName: string,
      gridSize = 10,
      colorCount = 4,
      challengeType: ChallengeType = 'standard',
      themeId: ThemeId = 'arcade',
      shape: BoardShape = 'classic',
    ) => {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      setSystemMessage('Setting up online room...');

      connect();
      // Optimistic preview so the board renders instantly; the ack replaces it.
      const isProg = challengeType === 'progressive';
      const size = isProg ? 10 : gridSize;
      const colors = isProg ? 4 : colorCount;
      const board = generateBoardForShape(shape, size, colors);
      const preview: OnlineRoomState = {
        roomId: '000000',
        gridSize: size,
        colorCount: colors,
        shape,
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
        series: { p1: 0, p2: 0, draws: 0 },
        rematchRequestedBy: null,
        resetProposal: null,
        challengeType,
        currentStage: 1,
        stageWins: { 1: [], 2: [] },
        themeId,
        p1Name: playerName.trim() || 'Player 1',
        p2Name: null,
        spectatorCount: 0,
        p1Connected: true,
        p2Connected: false,
        lastEmote: null,
      };
      setRoomState(preview);
      setMyRole(1);

      // Wait briefly for the socket so the very first room lands cleanly.
      const trySend = (attempt = 0) => {
        const ws = wsRef.current;
        if (attempt > 40) {
          setConnectionStatus('error');
          setErrorMessage('Could not reach the game server.');
          return;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          send({
            type: 'create_room',
            playerName,
            gridSize: size,
            colorCount: colors,
            challengeType,
            shape,
            themeId,
          });
        } else {
          window.setTimeout(() => trySend(attempt + 1), 25);
        }
      };
      trySend();
    },
    [connect, send],
  );

  const joinRoom = useCallback(
    async (roomId: string, playerName: string) => {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      setErrorCode(null);
      setSystemMessage(`Joining room ${roomId.toUpperCase()}...`);
      connect();
      const token = playerTokenRef.current ?? undefined;
      const trySend = (attempt = 0) => {
        if (attempt > 40) {
          setConnectionStatus('error');
          setErrorMessage('Could not reach the game server.');
          return;
        }
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          send({
            type: 'join_room',
            roomId: roomId.toUpperCase(),
            playerName,
            playerToken: token,
          });
        } else {
          window.setTimeout(() => trySend(attempt + 1), 25);
        }
      };
      trySend();
    },
    [connect, send],
  );

  /**
   * P6.6: watch a room without taking a player seat. Works on full rooms (a
   * full roster is exactly when "watch" is most interesting) and never holds
   * game authority — the seat is erased as soon as the socket drops.
   */
  const spectateRoom = useCallback(
    async (roomId: string, playerName?: string) => {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      setErrorCode(null);
      setSystemMessage(`Joining room ${roomId.toUpperCase()} as a spectator...`);
      connect();
      // A stored PLAYER token for this room reconnects it first (P3.7 role
      // derivation wins) — the server answers for the matching seat type.
      const token = playerTokenRef.current ?? undefined;
      const trySend = (attempt = 0) => {
        if (attempt > 40) {
          setConnectionStatus('error');
          setErrorMessage('Could not reach the game server.');
          return;
        }
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          send({
            type: 'join_room',
            roomId: roomId.toUpperCase(),
            playerName: playerName?.trim() ? playerName.trim() : undefined,
            playerToken: token,
            spectator: true,
          });
        } else {
          window.setTimeout(() => trySend(attempt + 1), 25);
        }
      };
      trySend();
    },
    [connect, send],
  );

  /** P6.6: host-only quick rematch (broadcast applies to every seat). */
  const hostRematch = useCallback(
    async (options?: {
      targetStage?: number;
      newGridSize?: number;
      newColorCount?: number;
    }) => {
      const current = roomStateRef.current;
      if (!current || myRoleRef.current !== 1) return;
      setSystemMessage('Starting the next round...');
      send({
        type: 'host_rematch',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
        targetStage: options?.targetStage,
        newGridSize: options?.newGridSize,
        newColorCount: options?.newColorCount,
      });
    },
    [send],
  );

  const makeMove = useCallback(
    (color: number) => {
      const current = roomStateRef.current;
      if (!current || current.status !== 'playing' || !myRoleRef.current) return;
      if (current.turn !== myRoleRef.current) return;

      optimisticMove(myRoleRef.current, color);
      send({
        type: 'move',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
        color,
      });
    },
    [send],
  );

  const proposeReset = useCallback(
    async (options?: {
      targetStage?: number;
      newGridSize?: number;
      newColorCount?: number;
    }) => {
      const current = roomStateRef.current;
      if (!current || !myRoleRef.current) return;
      // Optimistic proposal; server broadcast (or error->resync) converges.
      const proposal: ResetProposal = {
        requestedBy: myRoleRef.current,
        targetStage: options?.targetStage,
        newGridSize: options?.newGridSize,
        newColorCount: options?.newColorCount,
        timestamp: Date.now(),
      };
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              resetProposal: proposal,
              rematchRequestedBy: myRoleRef.current ?? null,
            }
          : prev,
      );
      setSystemMessage('Reset proposal sent — waiting for opponent...');
      send({
        type: 'propose_reset',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
        targetStage: options?.targetStage,
        newGridSize: options?.newGridSize,
        newColorCount: options?.newColorCount,
      });
    },
    [send],
  );

  const acceptReset = useCallback(async () => {
    const current = roomStateRef.current;
    if (!current) return;
    send({
      type: 'accept_reset',
      roomId: current.roomId,
      playerToken: playerTokenRef.current,
    });
  }, [send]);

  const declineReset = useCallback(async () => {
    const current = roomStateRef.current;
    if (!current) return;
    setRoomState((prev) =>
      prev ? { ...prev, resetProposal: null, rematchRequestedBy: null } : prev,
    );
    setSystemMessage('You declined the reset proposal.');
    send({
      type: 'decline_reset',
      roomId: current.roomId,
      playerToken: playerTokenRef.current,
    });
  }, [send]);

  const updateRoomSettings = useCallback(
    async (settings: {
      themeId?: string;
      gridSize?: number;
      colorCount?: number;
      challengeType?: ChallengeType;
      shape?: BoardShape;
      turnTimerSec?: 0 | 30 | 60;
    }) => {
      const current = roomStateRef.current;
      if (!current) return;
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              themeId: (settings.themeId as ThemeId) ?? prev.themeId,
              gridSize: settings.gridSize ?? prev.gridSize,
              colorCount: settings.colorCount ?? prev.colorCount,
              challengeType: settings.challengeType ?? prev.challengeType,
              shape: settings.shape ?? prev.shape,
              turnTimerSec: settings.turnTimerSec ?? prev.turnTimerSec,
              resetProposal: settings.challengeType ? null : prev.resetProposal,
            }
          : prev,
      );
      send({
        type: 'settings',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
        themeId: settings.themeId,
        gridSize: settings.gridSize,
        colorCount: settings.colorCount,
        challengeType: settings.challengeType,
        shape: settings.shape,
        turnTimerSec: settings.turnTimerSec,
      });
    },
    [send],
  );

  const leaveRoom = useCallback(() => {
    const current = roomStateRef.current;
    if (current) {
      send({
        type: 'leave',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
      });
    }
    intentionalCloseRef.current = true;
    playerTokenRef.current = null;
    roomIdRef.current = null;
    saveSession(null, null);
    setMyRole(null);
    myRoleRef.current = null;
    setIsSpectator(false);
    setRoomState(null);
    setSystemMessage(null);
    versionRef.current = 0;
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionStatus('disconnected');
  }, [send]);

  const sendOnlineEmote = useCallback(
    (emoji: string) => {
      const current = roomStateRef.current;
      if (!current) return;
      send({
        type: 'emote',
        roomId: current.roomId,
        playerToken: playerTokenRef.current,
        emoji,
      });
    },
    [send],
  );

  const setOnEmoteCallback = useCallback((cb: (role: 1 | 2, emoji: string) => void) => {
    onEmoteCallbackRef.current = cb;
  }, []);

  const isMyTurn =
    !!roomState && roomState.status === 'playing' && roomState.turn === myRole;

  return {
    roomState,
    myRole,
    isSpectator,
    errorCode,
    connectionStatus,
    errorMessage,
    systemMessage,
    isMyTurn,
    createRoom,
    joinRoom,
    spectateRoom,
    hostRematch,
    makeMove,
    proposeReset,
    acceptReset,
    declineReset,
    updateRoomSettings,
    leaveRoom,
    setErrorMessage,
    sendOnlineEmote,
    setOnEmoteCallback,
  };
}
