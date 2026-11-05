import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { OnlineRoomState, ChallengeType, ResetProposal, ThemeId } from '../types';
import {
  generateTwoPlayerGrid,
  expandPlayerTerritory,
  checkMultiplayerGameOver,
} from './floodLogic';

interface PeerMessage {
  type:
    | 'join'
    | 'game_init'
    | 'move'
    | 'reset_proposed'
    | 'reset_accepted'
    | 'reset_declined'
    | 'settings_updated'
    | 'rematch_req'
    | 'rematch_accept'
    | 'ping'
    | 'pong'
    | 'leave'
    | 'emote'
    | 'rejected';
  state?: OnlineRoomState;
  playerName?: string;
  color?: number;
  role?: 1 | 2;
  emoji?: string;
  reason?: string;
  message?: string;
  proposal?: ResetProposal | null;
  settings?: {
    themeId?: string;
    gridSize?: number;
    colorCount?: number;
    challengeType?: ChallengeType;
  };
}

const PEER_PREFIX = 'cflood-';

export function useOnlineMultiplayer() {
  const [roomState, setRoomState] = useState<OnlineRoomState | null>(null);
  const [myRole, setMyRole] = useState<1 | 2 | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const playerTokenRef = useRef<string | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const isHostRef = useRef<boolean>(false);
  const currentRoomStateRef = useRef<OnlineRoomState | null>(null);
  const myRoleRef = useRef<1 | 2 | null>(null);
  const onEmoteCallbackRef = useRef<((role: 1 | 2, emoji: string) => void) | null>(null);
  const lastPolledEmoteIdRef = useRef<number>(0);

  useEffect(() => {
    myRoleRef.current = myRole;
  }, [myRole]);

  useEffect(() => {
    currentRoomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const sendPeerData = (data: PeerMessage) => {
    if (connRef.current && connRef.current.open) {
      try {
        connRef.current.send(data);
      } catch (err) {
        console.warn('Failed to send WebRTC packet:', err);
      }
    }
  };

  // --- Fallback REST Poller ---
  const startServerPolling = useCallback((roomId: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.roomState) {
            // Emote polling check
            if (
              data.roomState.lastEmote &&
              data.roomState.lastEmote.id > lastPolledEmoteIdRef.current
            ) {
              lastPolledEmoteIdRef.current = data.roomState.lastEmote.id;
              if (
                data.roomState.lastEmote.role !== myRoleRef.current &&
                onEmoteCallbackRef.current
              ) {
                onEmoteCallbackRef.current(
                  data.roomState.lastEmote.role,
                  data.roomState.lastEmote.emoji,
                );
              }
            }

            setRoomState((prev) => {
              if (
                !prev ||
                prev.movesCount !== data.roomState.movesCount ||
                prev.status !== data.roomState.status ||
                prev.p2Connected !== data.roomState.p2Connected ||
                prev.turn !== data.roomState.turn ||
                prev.roundNumber !== data.roomState.roundNumber ||
                JSON.stringify(prev.resetProposal) !==
                  JSON.stringify(data.roomState.resetProposal)
              ) {
                return data.roomState;
              }
              return prev;
            });
          }
        }
      } catch {
        // silently catch
      }
    };

    pollingTimerRef.current = window.setInterval(poll, 1200);
  }, []);

  // --- CREATE ROOM (HOST / P1) ---
  const createRoom = useCallback(
    async (
      playerName: string,
      gridSize = 10,
      colorCount = 4,
      challengeType: ChallengeType = 'standard',
      themeId: ThemeId = 'arcade',
    ) => {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      setSystemMessage('Setting up online room...');

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const isProg = challengeType === 'progressive';
      const actualGridSize = isProg ? 10 : gridSize;
      const actualColorCount = isProg ? 4 : colorCount;

      const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateTwoPlayerGrid(
        actualGridSize,
        actualColorCount,
      );

      const initialRoomState: OnlineRoomState = {
        roomId: code,
        gridSize: actualGridSize,
        colorCount: actualColorCount,
        grid,
        turn: 1,
        firstTurnPlayer: 1,
        roundNumber: 1,
        p1Cells,
        p2Cells,
        p1Color,
        p2Color,
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
        p1Connected: true,
        p2Connected: false,
      };

      setRoomState(initialRoomState);
      setMyRole(1);
      isHostRef.current = true;

      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName,
          gridSize: actualGridSize,
          colorCount: actualColorCount,
          challengeType,
          themeId,
          requestedCode: code,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.playerToken) {
            playerTokenRef.current = data.playerToken;
            sessionStorage.setItem(`cflood_token_${code}`, data.playerToken);
          }
        })
        .catch(() => {});

      const peerId = `${PEER_PREFIX}${code}`;
      if (peerRef.current) peerRef.current.destroy();

      try {
        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });

        peerRef.current = peer;

        peer.on('open', () => {
          setConnectionStatus('connected');
          setSystemMessage(
            'Room active! Share the code or invite link with your friend.',
          );
          startServerPolling(code);
        });

        peer.on('connection', (conn) => {
          const state = currentRoomStateRef.current;
          if (
            connRef.current &&
            connRef.current.open &&
            state &&
            state.p2Connected &&
            conn !== connRef.current
          ) {
            conn.on('open', () => {
              try {
                conn.send({
                  type: 'rejected',
                  reason: 'ROOM_FULL',
                  message: 'This room is strictly limited to 2 players.',
                });
                setTimeout(() => {
                  try {
                    conn.close();
                  } catch {
                    /* intentionally ignored */
                  }
                }, 400);
              } catch {
                /* intentionally ignored */
              }
            });
            return;
          }

          connRef.current = conn;

          conn.on('open', () => {
            setSystemMessage('Player 2 is connecting...');
          });

          conn.on('data', (raw: unknown) => {
            const data = raw as PeerMessage;

            if (data.type === 'join') {
              const stateSnapshot = currentRoomStateRef.current;
              if (
                stateSnapshot &&
                stateSnapshot.p2Connected &&
                conn !== connRef.current
              ) {
                conn.send({
                  type: 'rejected',
                  reason: 'ROOM_FULL',
                  message: 'This room is already full (2/2 players).',
                });
                try {
                  conn.close();
                } catch {
                  /* intentionally ignored */
                }
                return;
              }

              const p2Name = data.playerName || 'Player 2';
              setRoomState((prev) => {
                if (!prev) return null;
                const updated: OnlineRoomState = {
                  ...prev,
                  p2Name,
                  p2Connected: true,
                  status: 'playing',
                };
                conn.send({ type: 'game_init', state: updated });
                return updated;
              });
              setSystemMessage(`${p2Name} joined! Player 1 starts first round.`);
            } else if (data.type === 'move') {
              if (data.color !== undefined) {
                handleReceiveMove(2, data.color);
              }
            } else if (data.type === 'reset_proposed' && data.proposal) {
              setRoomState((prev) =>
                prev ? { ...prev, resetProposal: data.proposal! } : null,
              );
              setSystemMessage('Opponent requested a match reset. Accept or decline?');
            } else if (data.type === 'reset_accepted' && data.state) {
              setRoomState(data.state);
              setSystemMessage(
                `Match reset accepted! Round ${data.state.roundNumber} • Player ${data.state.firstTurnPlayer} moves first.`,
              );
            } else if (data.type === 'reset_declined') {
              setRoomState((prev) =>
                prev ? { ...prev, resetProposal: null, rematchRequestedBy: null } : null,
              );
              setSystemMessage('Opponent declined the reset request.');
            } else if (data.type === 'settings_updated' && data.state) {
              setRoomState(data.state);
            } else if (data.type === 'emote' && data.emoji) {
              if (onEmoteCallbackRef.current) {
                onEmoteCallbackRef.current(2, data.emoji);
              }
            } else if (data.type === 'leave') {
              setRoomState((prev) => (prev ? { ...prev, p2Connected: false } : null));
              setSystemMessage('Player 2 left the match.');
            }
          });

          conn.on('close', () => {
            setRoomState((prev) => (prev ? { ...prev, p2Connected: false } : null));
            setSystemMessage('Player 2 disconnected.');
          });
        });

        peer.on('error', (err) => {
          console.warn('Peer error, fallback to server sync:', err);
          setConnectionStatus('connected');
          startServerPolling(code);
        });
      } catch (err) {
        console.warn('WebRTC creation error:', err);
        setConnectionStatus('connected');
        startServerPolling(code);
      }
    },
    [startServerPolling],
  );

  // --- JOIN ROOM (CLIENT / P2) ---
  const joinRoom = useCallback(
    async (rawCode: string, playerName: string) => {
      const code = rawCode.toUpperCase().trim();
      if (!code) return;

      setConnectionStatus('connecting');
      setErrorMessage(null);
      setSystemMessage(`Connecting to room ${code}...`);
      setMyRole(2);
      isHostRef.current = false;

      let joinedViaServer = false;

      try {
        const storedToken = sessionStorage.getItem(`cflood_token_${code}`) || undefined;
        const res = await fetch(`/api/rooms/${code}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName, playerToken: storedToken }),
        });

        if (res.status === 409) {
          const data = await res.json();
          const msg =
            data.error ||
            `Room "${code}" is full (2/2 players). Online matches are strictly 2 players only.`;
          setErrorMessage(msg);
          setConnectionStatus('error');
          setRoomState(null);
          setMyRole(null);
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.playerToken) {
            playerTokenRef.current = data.playerToken;
            sessionStorage.setItem(`cflood_token_${code}`, data.playerToken);
          }
          if (data.roomState) {
            setRoomState(data.roomState);
            setConnectionStatus('connected');
            setSystemMessage('Connected to room! Match ready.');
            joinedViaServer = true;
            startServerPolling(code);
          }
        }
      } catch {
        // proceed to direct WebRTC
      }

      if (peerRef.current) peerRef.current.destroy();

      const peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      peerRef.current = peer;

      peer.on('open', () => {
        const targetPeerId = `${PEER_PREFIX}${code}`;
        const conn = peer.connect(targetPeerId, { reliable: true });
        connRef.current = conn;

        conn.on('open', () => {
          setConnectionStatus('connected');
          conn.send({
            type: 'join',
            playerName: playerName.trim() || 'Player 2',
          });
          setSystemMessage('Connected directly to Player 1!');
          startServerPolling(code);
        });

        conn.on('data', (raw: unknown) => {
          const data = raw as PeerMessage;

          if (data.type === 'rejected') {
            setErrorMessage(
              data.message ||
                'Room is full (2/2 players already playing). Only 2 players allowed.',
            );
            setConnectionStatus('error');
            setRoomState(null);
            setMyRole(null);
            try {
              conn.close();
            } catch {
              /* intentionally ignored */
            }
            return;
          }

          if (data.type === 'game_init' && data.state) {
            setRoomState(data.state);
            setSystemMessage(`Match started with ${data.state.p1Name}!`);
          } else if (data.type === 'move' && data.color !== undefined) {
            handleReceiveMove(1, data.color);
          } else if (data.type === 'reset_proposed' && data.proposal) {
            setRoomState((prev) =>
              prev ? { ...prev, resetProposal: data.proposal! } : null,
            );
            setSystemMessage('Opponent requested a match reset. Accept or decline?');
          } else if (data.type === 'reset_accepted' && data.state) {
            setRoomState(data.state);
            setSystemMessage(
              `Match reset accepted! Round ${data.state.roundNumber} • Player ${data.state.firstTurnPlayer} moves first.`,
            );
          } else if (data.type === 'reset_declined') {
            setRoomState((prev) =>
              prev ? { ...prev, resetProposal: null, rematchRequestedBy: null } : null,
            );
            setSystemMessage('Opponent declined the reset request.');
          } else if (data.type === 'settings_updated' && data.state) {
            setRoomState(data.state);
          } else if (data.type === 'emote' && data.emoji) {
            if (onEmoteCallbackRef.current) {
              onEmoteCallbackRef.current(1, data.emoji);
            }
          } else if (data.type === 'leave') {
            setSystemMessage('Host has left the room.');
          }
        });

        conn.on('close', () => {
          setSystemMessage('Connection with Player 1 closed.');
        });

        conn.on('error', (err) => {
          console.warn('Direct peer connection error:', err);
          if (!joinedViaServer) {
            setErrorMessage(
              `Could not connect to room "${code}". Please check the code.`,
            );
            setConnectionStatus('error');
          }
        });
      });

      peer.on('error', (err) => {
        console.warn('Peer error:', err);
        if (!joinedViaServer) {
          setErrorMessage(`Unable to find room "${code}". Make sure Player 1 is ready.`);
          setConnectionStatus('error');
        }
      });
    },
    [startServerPolling],
  );

  // --- MOVE CALCULATION (SHARED) ---
  const handleReceiveMove = (fromRole: 1 | 2, color: number) => {
    setRoomState((prev) => {
      if (!prev) return null;
      const currentCells = fromRole === 1 ? prev.p1Cells : prev.p2Cells;
      const opponentCells = fromRole === 1 ? prev.p2Cells : prev.p1Cells;

      const { newGrid, newCells, gain } = expandPlayerTerritory(
        prev.grid,
        currentCells,
        opponentCells,
        color,
      );

      const nextP1Cells = fromRole === 1 ? newCells : prev.p1Cells;
      const nextP2Cells = fromRole === 2 ? newCells : prev.p2Cells;
      const nextP1Color = fromRole === 1 ? color : prev.p1Color;
      const nextP2Color = fromRole === 2 ? color : prev.p2Color;

      const totalCells = prev.gridSize * prev.gridSize;
      const outcome = checkMultiplayerGameOver(
        totalCells,
        nextP1Cells.length,
        nextP2Cells.length,
        prev.colorCount,
        nextP1Color,
        nextP2Color,
        newGrid,
        nextP1Cells,
        nextP2Cells,
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

  // --- MAKE MOVE ---
  const makeMove = useCallback(
    (color: number) => {
      const current = currentRoomStateRef.current;
      if (!current || current.status !== 'playing' || !myRole) return;
      if (current.turn !== myRole) return;

      sendPeerData({ type: 'move', color, role: myRole });
      handleReceiveMove(myRole, color);

      fetch(`/api/rooms/${current.roomId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: myRole, color, playerToken: playerTokenRef.current }),
      }).catch(() => {});
    },
    [myRole],
  );

  // --- PROPOSE RESET (Opponent Approval Flow) ---
  const proposeReset = useCallback(
    async (options?: {
      targetStage?: number;
      newGridSize?: number;
      newColorCount?: number;
    }) => {
      const current = currentRoomStateRef.current;
      if (!current || !myRole) return;

      const proposal: ResetProposal = {
        requestedBy: myRole,
        targetStage: options?.targetStage,
        newGridSize: options?.newGridSize,
        newColorCount: options?.newColorCount,
        timestamp: Date.now(),
      };

      setRoomState((prev) => (prev ? { ...prev, resetProposal: proposal } : null));
      setSystemMessage('Reset requested! Waiting for opponent approval...');

      sendPeerData({ type: 'reset_proposed', proposal });

      try {
        const res = await fetch(`/api/rooms/${current.roomId}/propose-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: myRole,
            playerToken: playerTokenRef.current,
            targetStage: options?.targetStage,
            newGridSize: options?.newGridSize,
            newColorCount: options?.newColorCount,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.approved && data.roomState) {
            setRoomState(data.roomState);
            sendPeerData({ type: 'reset_accepted', state: data.roomState });
            setSystemMessage('Mutual rematch accepted! New round started.');
          } else if (data.roomState) {
            setRoomState(data.roomState);
          }
        }
      } catch {
        /* intentionally ignored */
      }
    },
    [myRole],
  );

  // --- ACCEPT RESET ---
  const acceptReset = useCallback(async () => {
    const current = currentRoomStateRef.current;
    if (!current || !myRole) return;

    try {
      const res = await fetch(`/api/rooms/${current.roomId}/accept-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: myRole, playerToken: playerTokenRef.current }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.roomState) {
          setRoomState(data.roomState);
          sendPeerData({ type: 'reset_accepted', state: data.roomState });
          setSystemMessage(
            `Reset accepted! Round ${data.roomState.roundNumber} • Player ${data.roomState.firstTurnPlayer} starts.`,
          );
        }
      }
    } catch {
      /* intentionally ignored */
    }
  }, [myRole]);

  // --- DECLINE RESET ---
  const declineReset = useCallback(async () => {
    const current = currentRoomStateRef.current;
    if (!current || !myRole) return;

    setRoomState((prev) =>
      prev ? { ...prev, resetProposal: null, rematchRequestedBy: null } : null,
    );
    sendPeerData({ type: 'reset_declined', role: myRole });
    setSystemMessage('You declined the reset proposal.');

    try {
      await fetch(`/api/rooms/${current.roomId}/decline-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: myRole, playerToken: playerTokenRef.current }),
      });
    } catch {
      /* intentionally ignored */
    }
  }, [myRole]);

  // --- UPDATE SETTINGS ---
  const updateRoomSettings = useCallback(
    async (settings: {
      themeId?: string;
      gridSize?: number;
      colorCount?: number;
      challengeType?: ChallengeType;
    }) => {
      const current = currentRoomStateRef.current;
      if (!current) return;

      try {
        const res = await fetch(`/api/rooms/${current.roomId}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: myRole, playerToken: playerTokenRef.current, ...settings }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.roomState) {
            setRoomState(data.roomState);
            sendPeerData({ type: 'settings_updated', state: data.roomState });
          }
        }
      } catch {
        /* intentionally ignored */
      }
    },
    [myRole],
  );

  // --- LEAVE ROOM ---
  const leaveRoom = useCallback(() => {
    const current = currentRoomStateRef.current;
    if (current) {
      sendPeerData({ type: 'leave' });
      fetch(`/api/rooms/${current.roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: myRole, playerToken: playerTokenRef.current }),
      }).catch(() => {});
      sessionStorage.removeItem(`cflood_token_${current.roomId}`);
    }

    playerTokenRef.current = null;
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    if (connRef.current) connRef.current.close();
    if (peerRef.current) peerRef.current.destroy();

    setRoomState(null);
    setMyRole(null);
    setConnectionStatus('disconnected');
    setErrorMessage(null);
    setSystemMessage(null);
  }, [myRole]);

  // --- EMOTE SHARING ---
  const sendOnlineEmote = useCallback(
    (emoji: string) => {
      const current = currentRoomStateRef.current;
      if (!current || !myRole) return;

      sendPeerData({ type: 'emote', emoji, role: myRole });

      fetch(`/api/rooms/${current.roomId}/emote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: myRole, emoji, playerToken: playerTokenRef.current }),
      }).catch(() => {});
    },
    [myRole],
  );

  const setOnEmoteCallback = useCallback((cb: (role: 1 | 2, emoji: string) => void) => {
    onEmoteCallbackRef.current = cb;
  }, []);

  const isMyTurn =
    Boolean(roomState) && roomState?.status === 'playing' && roomState?.turn === myRole;

  return {
    roomState,
    myRole,
    connectionStatus,
    errorMessage,
    systemMessage,
    isMyTurn,
    createRoom,
    joinRoom,
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
