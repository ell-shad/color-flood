import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import { ClientMessage } from './protocol';
import type { RoomService, BroadcastBus } from './rooms';

/**
 * WebSocket transport for the Phase 3 protocol.
 *
 * Responsibilities intentionally limited to: zod validation, per-socket message
 * size + rate guards, token↔socket binding, and fan-out. ALL authority lives in
 * `server/rooms.ts`.
 */

const MAX_MESSAGE_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 2000;
const RATE_WINDOW_MAX = 30;
const MAX_SOCKETS_PER_TOKEN = 4;

interface Session {
  roomId: string;
  token: string;
  role: 1 | 2;
}

export interface MountedWs {
  sessionCount(): number;
  bus: BroadcastBus;
}

export const mountWsServer = (wss: WebSocketServer, service: RoomService): MountedWs => {
  const sessions = new WeakMap<WebSocket, Session>();
  // Multiple sockets can exist per token (refresh races; capped).
  const tokenSockets = new Map<string, Set<WebSocket>>();
  const roomSockets = new Map<string, Set<WebSocket>>();

  const bind = (ws: WebSocket, roomId: string, token: string, role: 1 | 2) => {
    sessions.set(ws, { roomId, token, role });
    const tokenSet = tokenSockets.get(token) ?? new Set<WebSocket>();
    tokenSet.add(ws);
    tokenSockets.set(token, tokenSet);
    if (tokenSet.size > MAX_SOCKETS_PER_TOKEN) {
      // Refresh-race overflow: drop the oldest extra sockets for this token.
      for (const old of tokenSet) {
        if (old !== ws) {
          try {
            old.close(4009, 'replaced');
            tokenSet.delete(old);
          } catch {
            /* already closing */
          }
          break;
        }
      }
    }
    const roomSet = roomSockets.get(roomId) ?? new Set<WebSocket>();
    roomSet.add(ws);
    roomSockets.set(roomId, roomSet);
  };

  const unbind = (ws: WebSocket) => {
    const session = sessions.get(ws);
    if (!session) return;
    sessions.delete(ws);
    tokenSockets.get(session.token)?.delete(ws);
    roomSockets.get(session.roomId)?.delete(ws);
  };

  const send = (ws: WebSocket, message: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        /* closed mid-send */
      }
    }
  };

  const bus: BroadcastBus = {
    toRoom(roomId, message) {
      const set = roomSockets.get(roomId);
      if (!set) return;
      for (const ws of set) send(ws, message);
    },
    toToken(token, message) {
      const set = tokenSockets.get(token);
      if (!set) return;
      for (const ws of set) send(ws, message);
    },
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/ws')) {
      ws.close(1008, 'wrong path');
      return;
    }

    // Simple per-socket token bucket.
    const windowStart = { t: Date.now(), count: 0 };

    ws.on('message', (raw: RawData) => {
      const buf = raw as Buffer;
      if (buf.length > MAX_MESSAGE_BYTES) {
        send(ws, { type: 'error', code: 'bad_message', message: 'too large' });
        ws.close(1009, 'message too large');
        return;
      }

      const t = Date.now();
      if (t - windowStart.t > RATE_WINDOW_MS) {
        windowStart.t = t;
        windowStart.count = 0;
      }
      windowStart.count++;
      if (windowStart.count > RATE_WINDOW_MAX) {
        send(ws, {
          type: 'error',
          code: 'too_fast',
          message: 'too many messages, slow down',
        });
        return;
      }

      let parsed: ClientMessage;
      try {
        const data = JSON.parse(buf.toString('utf8'));
        const result = ClientMessage.safeParse(data);
        if (!result.success) {
          send(ws, {
            type: 'error',
            code: 'bad_message',
            message: result.error.issues[0]?.message ?? 'invalid message',
          });
          return;
        }
        parsed = result.data;
      } catch {
        send(ws, { type: 'error', code: 'bad_message', message: 'bad json' });
        return;
      }

      const fail = (code: string, message: string) =>
        send(ws, { type: 'error', code, message });

      try {
        switch (parsed.type) {
          case 'ping':
            send(ws, { type: 'pong' });
            return;
          case 'create_room': {
            const created = service.createRoom(parsed);
            bind(ws, created.roomId, created.token, created.role);
            return;
          }
          case 'join_room': {
            const result = service.joinRoom(
              parsed.roomId,
              parsed.playerName,
              parsed.playerToken,
            );
            if (result.ok) {
              bind(ws, result.roomId, result.token, result.role);
              if (parsed.playerToken && result.token !== parsed.playerToken) {
                fail('not_authenticated', 'unknown token — joined as a new player');
              }
            } else {
              fail(result.code, result.message);
            }
            return;
          }
          case 'resume': {
            const result = service.resume(parsed.roomId, parsed.playerToken);
            if (result.ok) {
              bind(ws, parsed.roomId.toUpperCase(), parsed.playerToken, result.role);
            } else {
              fail(result.code, result.message);
            }
            return;
          }
          case 'move': {
            const result = service.move(parsed.roomId, parsed.playerToken, parsed.color);
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'propose_reset': {
            const result = service.proposeReset(parsed.roomId, parsed.playerToken, {
              targetStage: parsed.targetStage,
              newGridSize: parsed.newGridSize,
              newColorCount: parsed.newColorCount,
            });
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'accept_reset': {
            const result = service.acceptReset(parsed.roomId, parsed.playerToken);
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'decline_reset': {
            const result = service.declineReset(parsed.roomId, parsed.playerToken);
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'settings': {
            const result = service.updateSettings(parsed.roomId, parsed.playerToken, {
              themeId: parsed.themeId,
              gridSize: parsed.gridSize,
              colorCount: parsed.colorCount,
              challengeType: parsed.challengeType,
            });
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'leave': {
            const result = service.leave(parsed.roomId, parsed.playerToken);
            if (result.ok && result.closed) ws.close(1000, 'room_closed');
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          case 'emote': {
            const result = service.emote(parsed.roomId, parsed.playerToken, parsed.emoji);
            if (!result.ok) fail(result.code ?? 'bad_message', result.message ?? 'error');
            return;
          }
          default: {
            const exhaustive: never = parsed;
            void exhaustive;
            return;
          }
        }
      } catch (e) {
        fail('bad_message', 'internal error');
        console.error('ws handler error', e);
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      unbind(ws);
      if (session) service.socketClosed(session.token);
    });

    ws.on('error', () => unbind(ws));
  });

  return {
    sessionCount: () => [...roomSockets.values()].reduce((n, s) => n + s.size, 0),
    bus,
  };
};
