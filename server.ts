import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createRoomService, createInMemoryStore, type RoomService } from './server/rooms';
import { mountWsServer } from './server/wsServer';
import type { BroadcastBus } from './server/rooms';

/**
 * Composition root (Phase 3).
 *
 * Game logic lives in `server/rooms.ts` (server-authoritative); transport in
 * `server/wsServer.ts`. There is no game-over-REST surface: the client speaks
 * the single zod-validated WebSocket protocol on /api/ws.
 *
 * P3.6 hardening: helmet (CSP off until the PWA phase; the app relies on
 * inline styles), CORS restricted to APP_URL (unset = same-origin only),
 * an HTTP rate limit on /api, and 16 KiB JSON bodies. Message caps, per-
 * socket rate limiting and the RoomStore seam landed with P3.1.
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

  app.use(
    helmet({
      // CSP/COEP stay off until the PWA phase: the UI uses runtime-injected
      // styles and (in dev) Vite HMR, both trip strict policies.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS: only APP_URL may call /api cross-origin. Unset = same-origin only.
  const allowedOrigin = process.env.APP_URL;
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next(); // curl / same-origin GET / health checks
    const sameHost =
      origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    if (sameHost) return next();
    if (allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.sendStatus(204);
        return;
      }
      return next();
    }
    res.status(403).json({ error: 'Forbidden origin.' });
  });

  // Light HTTP rate limit (per IP). The ws layer has its own per-socket guard.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );

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
