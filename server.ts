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
 * Game logic lives in `server/rooms.ts` (server-authoritative); transport in
 * `server/wsServer.ts`. There is no game-over-REST surface: the client speaks
 * the single zod-validated WebSocket protocol on /api/ws.
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
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: service.activeRoomCount() });
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

// Room GC + P3.5 enforcement loops (unstoppable on unref'd timers).
export const startRoomSweep = (svc: RoomService) => {
  const gc = setInterval(() => svc.sweep(2 * 60 * 60 * 1000), 5 * 60 * 1000);
  gc.unref();
  const grace = setInterval(() => svc.enforceDisconnects(), 5_000);
  grace.unref();
  const turn = setInterval(() => svc.enforceTurnTimers(), 1_000);
  turn.unref();
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const instance = createAppServer();
  void instance.listen().then(() => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    startRoomSweep(instance.service);
  });
}
