import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import { createRoomService, createInMemoryStore, type RoomService } from './server/rooms';
import { mountWsServer } from './server/wsServer';
import type { BroadcastBus } from './server/rooms';

/**
 * Composition root (Phase 3).
 *
 * Game logic lives in `server/rooms.ts` (server-authoritative), transport in
 * `server/wsServer.ts`. Legacy REST endpoints below delegate all decisions to
 * the service and are kept ONLY for the interim client; they are removed in
 * P3.4 when the client switches fully to the socket protocol.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

let mounted: ReturnType<typeof mountWsServer> | null = null;

// Late-bound bus: the service is constructed before the ws server mounts.
const bus: BroadcastBus = {
  toRoom: (roomId, message) => mounted?.bus.toRoom(roomId, message),
  toToken: (token, message) => mounted?.bus.toToken(token, message),
};

const service: RoomService = createRoomService({
  store: createInMemoryStore(),
  bus,
  now: () => Date.now(),
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

export const createAppServer = () => {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: service.activeRoomCount() });
  });

  // --- Legacy REST (interim; superseded by the ws protocol, see header) ---

  const requireToken = (
    body: Record<string, unknown>,
    res: express.Response,
  ): string | null => {
    const token = body.playerToken;
    if (typeof token !== 'string' || token.length < 8) {
      res.status(401).json({ error: 'playerToken required.' });
      return null;
    }
    return token;
  };

  // Create Room — server generates the code; requestedCode is ignored (hijack fix).
  app.post('/api/rooms', (req, res) => {
    const body = req.body ?? {};
    const created = service.createRoom({
      playerName: typeof body.playerName === 'string' ? body.playerName : undefined,
      gridSize: typeof body.gridSize === 'number' ? body.gridSize : undefined,
      colorCount: typeof body.colorCount === 'number' ? body.colorCount : undefined,
      challengeType:
        body.challengeType === 'progressive' || body.challengeType === 'standard'
          ? body.challengeType
          : undefined,
      themeId: typeof body.themeId === 'string' ? body.themeId : undefined,
    });
    const snap = service.snapshotFor(created.roomId, 1);
    res.json({
      roomId: created.roomId,
      role: 1,
      playerToken: created.token,
      roomState: snap?.roomState,
    });
  });

  // Join Room (or token reconnect). Role is DERIVED from token — never claimed.
  app.post('/api/rooms/:roomId/join', (req, res) => {
    const roomId = req.params.roomId.toUpperCase();
    const body = req.body ?? {};
    const result = service.joinRoom(
      roomId,
      typeof body.playerName === 'string' ? body.playerName : undefined,
      typeof body.playerToken === 'string' ? body.playerToken : undefined,
    );
    if (!result.ok) {
      const status =
        result.code === 'room_not_found' ? 404 : result.code === 'room_full' ? 409 : 400;
      const extra =
        result.code === 'room_full'
          ? { code: 'ROOM_FULL', ...service.readState(roomId) }
          : {};
      res.status(status).json({ error: result.message, ...extra });
      return;
    }
    res.json({
      role: result.role,
      playerToken: result.token,
      roomState: service.snapshotFor(roomId, result.role)?.roomState,
    });
  });

  // Get Room State (interim REST polling; no tokens in state).
  app.get('/api/rooms/:roomId', (req, res) => {
    const roomState = service.readState(req.params.roomId.toUpperCase());
    if (!roomState) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    res.json({ roomState });
  });

  // Make Move
  app.post('/api/rooms/:roomId/move', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const color = (req.body ?? {}).color;
    const result = service.move(roomId, token, typeof color === 'number' ? color : -1);
    if (!result.ok) {
      res
        .status(result.code === 'not_your_turn' ? 400 : 400)
        .json({ error: result.message });
      return;
    }
    res.json({ roomState: service.snapshotFor(roomId, null)?.roomState });
  });

  // Propose Reset / Rematch
  app.post('/api/rooms/:roomId/propose-reset', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const body = req.body ?? {};
    const result = service.proposeReset(roomId, token, {
      targetStage: typeof body.targetStage === 'number' ? body.targetStage : undefined,
      newGridSize: typeof body.newGridSize === 'number' ? body.newGridSize : undefined,
      newColorCount:
        typeof body.newColorCount === 'number' ? body.newColorCount : undefined,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    const roomState = service.snapshotFor(roomId, null)?.roomState;
    res.json({
      roomState,
      approved: result.approved ?? false,
      waitingApproval: result.waiting ?? false,
    });
  });

  // Accept Reset (alias kept for the interim client)
  app.post('/api/rooms/:roomId/accept-reset', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const result = service.acceptReset(roomId, token);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ roomState: service.snapshotFor(roomId, null)?.roomState, success: true });
  });

  // Decline Reset
  app.post('/api/rooms/:roomId/decline-reset', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const result = service.declineReset(roomId, token);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ roomState: service.snapshotFor(roomId, null)?.roomState, declined: true });
  });

  // Legacy rematch alias → propose flow
  app.post('/api/rooms/:roomId/rematch', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const result = service.proposeReset(roomId, token, {});
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ roomState: service.snapshotFor(roomId, null)?.roomState });
  });

  // Update Room Settings (role derived from token; template changes locked mid-game)
  app.post('/api/rooms/:roomId/settings', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const roomId = req.params.roomId.toUpperCase();
    const body = req.body ?? {};
    const result = service.updateSettings(roomId, token, {
      themeId: typeof body.themeId === 'string' ? body.themeId : undefined,
      gridSize: typeof body.gridSize === 'number' ? body.gridSize : undefined,
      colorCount: typeof body.colorCount === 'number' ? body.colorCount : undefined,
      challengeType:
        body.challengeType === 'progressive' || body.challengeType === 'standard'
          ? body.challengeType
          : undefined,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ roomState: service.snapshotFor(roomId, null)?.roomState });
  });

  // Leave Room (host leaving closes the room)
  app.post('/api/rooms/:roomId/leave', (req, res) => {
    const roomId = req.params.roomId.toUpperCase();
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const result = service.leave(roomId, token);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ success: true });
  });

  // Emote Reaction
  app.post('/api/rooms/:roomId/emote', (req, res) => {
    const token = requireToken(req.body ?? {}, res);
    if (!token) return;
    const body = req.body ?? {};
    const result = service.emote(
      req.params.roomId.toUpperCase(),
      token,
      typeof body.emoji === 'string' ? body.emoji : '👏',
    );
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ success: true });
  });

  // --- Vite middleware in dev or static serve in prod ---
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');
  const server = http.createServer(app);

  async function prepare() {
    if (!isProduction && fs.existsSync(path.resolve(__dirname, 'vite.config.ts'))) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
    server.on('upgrade', (request, socket, head) => {
      const url = request.url
        ? new URL(request.url, `http://${request.headers.host}`)
        : null;
      if (url && url.pathname === '/api/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    });
    mounted = mountWsServer(wss, service);
  }

  async function listen(port = PORT) {
    await prepare();
    await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', () => resolve()));
  }

  const stop = () =>
    new Promise<void>((resolve) => {
      wss.clients.forEach((c) => c.close());
      server.close(() => resolve());
      resolve();
    });

  return { app, server, service, wss, listen, stop, mount: () => mounted };
};

// Room GC
const INTERVALS: NodeJS.Timeout[] = [];
export const startRoomSweep = (svc: RoomService) => {
  const id = setInterval(() => svc.sweep(2 * 60 * 60 * 1000), 5 * 60 * 1000);
  id.unref();
  INTERVALS.push(id);
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const instance = createAppServer();
  void instance.listen().then(() => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    startRoomSweep(instance.service);
  });
}
