import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  generateTwoPlayerGrid,
  expandPlayerTerritory,
  checkMultiplayerGameOver,
} from './src/utils/floodLogic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);

// Dedicated WebSocket server with explicit path isolation
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());

// Enable CORS for all API routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// --- Progressive Difficulty Stages Definition ---
const STAGE_CONFIGS: Record<number, { gridSize: number; colorCount: number }> = {
  1: { gridSize: 10, colorCount: 4 },
  2: { gridSize: 12, colorCount: 5 },
  3: { gridSize: 14, colorCount: 6 },
  4: { gridSize: 16, colorCount: 6 },
  5: { gridSize: 18, colorCount: 7 },
};

// --- In-Memory Room Store ---

interface PlayerSession {
  id: string;
  name: string;
  ws?: WebSocket | null;
  connected: boolean;
  lastSeen: number;
}

interface ResetProposal {
  requestedBy: 1 | 2;
  targetStage?: number;
  newGridSize?: number;
  newColorCount?: number;
  timestamp: number;
}

interface OnlineRoom {
  roomId: string;
  gridSize: number;
  colorCount: number;
  p1: PlayerSession;
  p2: PlayerSession | null;
  grid: number[][];
  turn: 1 | 2;
  firstTurnPlayer: 1 | 2;
  roundNumber: number;
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
  resetProposal: ResetProposal | null;
  challengeType: 'standard' | 'progressive';
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  themeId: string;
  lastActive: number;
  lastEmote?: { role: 1 | 2; emoji: string; id: number } | null;
}

const rooms = new Map<string, OnlineRoom>();

const sanitizeRoomState = (room: OnlineRoom) => {
  return {
    roomId: room.roomId,
    gridSize: room.gridSize,
    colorCount: room.colorCount,
    grid: room.grid,
    turn: room.turn,
    firstTurnPlayer: room.firstTurnPlayer,
    roundNumber: room.roundNumber,
    p1Cells: room.p1Cells,
    p2Cells: room.p2Cells,
    p1Color: room.p1Color,
    p2Color: room.p2Color,
    status: room.status,
    p1Moves: room.p1Moves,
    p2Moves: room.p2Moves,
    movesCount: room.movesCount,
    lastGains: room.lastGains,
    series: room.series,
    rematchRequestedBy: room.rematchRequestedBy,
    resetProposal: room.resetProposal,
    challengeType: room.challengeType,
    currentStage: room.currentStage,
    stageWins: room.stageWins,
    themeId: room.themeId,
    p1Name: room.p1.name,
    p2Name: room.p2 ? room.p2.name : null,
    p1Connected: room.p1.connected,
    p2Connected: room.p2 ? room.p2.connected : false,
    lastActive: room.lastActive,
    lastEmote: room.lastEmote || null,
  };
};

const broadcastRoom = (room: OnlineRoom, payload: unknown) => {
  const json = JSON.stringify(payload);
  if (room.p1.ws && room.p1.ws.readyState === WebSocket.OPEN) {
    room.p1.ws.send(json);
  }
  if (room.p2?.ws && room.p2.ws.readyState === WebSocket.OPEN) {
    room.p2.ws.send(json);
  }
};

const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
};

// Cleanup stale rooms older than 2 hours
setInterval(
  () => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (now - room.lastActive > 2 * 60 * 60 * 1000) {
        rooms.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

// --- REST API Endpoints ---

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size });
});

// Create Room
app.post('/api/rooms', (req, res) => {
  const {
    playerName = 'Player 1',
    gridSize = 10,
    colorCount = 4,
    challengeType = 'standard',
    themeId = 'arcade',
    requestedCode,
  } = req.body;

  const roomId = requestedCode
    ? String(requestedCode).toUpperCase().trim()
    : generateRoomCode();

  const isProgressive = challengeType === 'progressive';
  const effectiveGridSize = isProgressive ? 10 : Number(gridSize) || 10;
  const effectiveColorCount = isProgressive ? 4 : Number(colorCount) || 4;

  const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateTwoPlayerGrid(
    effectiveGridSize,
    effectiveColorCount,
  );

  const p1Token = 'p1_' + Math.random().toString(36).substring(2, 12);

  const newRoom: OnlineRoom = {
    roomId,
    gridSize: effectiveGridSize,
    colorCount: effectiveColorCount,
    p1: {
      id: p1Token,
      name: String(playerName || 'Player 1').trim() || 'Player 1',
      ws: null,
      connected: true,
      lastSeen: Date.now(),
    },
    p2: null,
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
    challengeType: isProgressive ? 'progressive' : 'standard',
    currentStage: 1,
    stageWins: { 1: [], 2: [] },
    themeId: String(themeId || 'arcade'),
    lastActive: Date.now(),
  };

  rooms.set(roomId, newRoom);
  res.json({
    roomId,
    role: 1,
    playerToken: p1Token,
    roomState: sanitizeRoomState(newRoom),
  });
});

// Join Room - Strictly enforce max 2 players per room
app.post('/api/rooms/:roomId/join', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const playerName = String(req.body.playerName || 'Player 2').trim() || 'Player 2';
  const playerToken = req.body.playerToken ? String(req.body.playerToken) : null;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({
      error: `Room "${roomId}" not found. Please check code or create a new room.`,
    });
    return;
  }

  // 1. Existing Player 1 reconnecting
  if (playerToken && playerToken === room.p1.id) {
    room.p1.connected = true;
    room.p1.lastSeen = Date.now();
    room.lastActive = Date.now();
    res.json({
      role: 1,
      playerToken: room.p1.id,
      roomState: sanitizeRoomState(room),
    });
    return;
  }

  // 2. Existing Player 2 reconnecting
  if (playerToken && room.p2 && playerToken === room.p2.id) {
    room.p2.connected = true;
    room.p2.lastSeen = Date.now();
    room.lastActive = Date.now();
    res.json({
      role: 2,
      playerToken: room.p2.id,
      roomState: sanitizeRoomState(room),
    });
    return;
  }

  // 3. Strict 2-player capacity enforcement
  if (room.p2 !== null) {
    res.status(409).json({
      error: `Room "${roomId}" is full. There are already 2 players in this match.`,
      code: 'ROOM_FULL',
      p1Name: room.p1.name,
      p2Name: room.p2.name,
    });
    return;
  }

  // 4. Accept new Player 2
  const p2Token = 'p2_' + Math.random().toString(36).substring(2, 12);
  room.p2 = {
    id: p2Token,
    name: playerName,
    ws: null,
    connected: true,
    lastSeen: Date.now(),
  };
  room.status = 'playing';
  room.lastActive = Date.now();

  broadcastRoom(room, {
    type: 'match_started',
    roomState: sanitizeRoomState(room),
  });

  res.json({
    role: 2,
    playerToken: p2Token,
    roomState: sanitizeRoomState(room),
  });
});

// Get Room State
app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }
  room.lastActive = Date.now();
  res.json({ roomState: sanitizeRoomState(room) });
});

// Make Move
app.post('/api/rooms/:roomId/move', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role, color } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  if (room.status !== 'playing') {
    res
      .status(400)
      .json({ error: 'Game is not active.', roomState: sanitizeRoomState(room) });
    return;
  }

  if (room.turn !== role) {
    res.status(400).json({ error: 'Not your turn.', roomState: sanitizeRoomState(room) });
    return;
  }

  if (color === room.p1Color || color === room.p2Color) {
    res
      .status(400)
      .json({ error: 'Color is occupied.', roomState: sanitizeRoomState(room) });
    return;
  }

  const currentCells = role === 1 ? room.p1Cells : room.p2Cells;
  const opponentCells = role === 1 ? room.p2Cells : room.p1Cells;

  const { newGrid, newCells, gain } = expandPlayerTerritory(
    room.grid,
    currentCells,
    opponentCells,
    color,
  );

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
  room.lastActive = Date.now();

  const totalCells = room.gridSize * room.gridSize;
  const outcome = checkMultiplayerGameOver(
    totalCells,
    room.p1Cells.length,
    room.p2Cells.length,
    room.colorCount,
    room.p1Color,
    room.p2Color,
    room.grid,
    room.p1Cells,
    room.p2Cells,
  );

  room.status = outcome;

  if (outcome !== 'playing') {
    if (outcome === 'p1_won') {
      room.series.p1 += 1;
      if (
        room.challengeType === 'progressive' &&
        !room.stageWins[1].includes(room.currentStage)
      ) {
        room.stageWins[1].push(room.currentStage);
      }
    } else if (outcome === 'p2_won') {
      room.series.p2 += 1;
      if (
        room.challengeType === 'progressive' &&
        !room.stageWins[2].includes(room.currentStage)
      ) {
        room.stageWins[2].push(room.currentStage);
      }
    } else if (outcome === 'draw') {
      room.series.draws += 1;
    }
  }

  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'move_made',
    roomState: sanitized,
  });

  res.json({ roomState: sanitized });
});

// Helper: Start Next Round with Alternating First Turn
function executeNextRound(
  room: OnlineRoom,
  targetStage?: number,
  newGridSize?: number,
  newColorCount?: number,
) {
  room.roundNumber += 1;
  // Alternating first turn: If P1 started last, P2 starts this round; if P2 started, P1 starts!
  const nextFirst = room.firstTurnPlayer === 1 ? 2 : 1;
  room.firstTurnPlayer = nextFirst;
  room.turn = nextFirst;

  // Progressive Stage check
  if (room.challengeType === 'progressive') {
    if (targetStage !== undefined && targetStage >= 1 && targetStage <= 5) {
      room.currentStage = targetStage;
    } else if (room.status !== 'playing' && room.status !== 'waiting') {
      // Advance to next stage after finishing a stage
      room.currentStage = Math.min(5, room.currentStage + 1);
    }
    const stageConf = STAGE_CONFIGS[room.currentStage] || { gridSize: 10, colorCount: 4 };
    room.gridSize = stageConf.gridSize;
    room.colorCount = stageConf.colorCount;
  } else {
    if (newGridSize) room.gridSize = Number(newGridSize);
    if (newColorCount) room.colorCount = Number(newColorCount);
  }

  const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateTwoPlayerGrid(
    room.gridSize,
    room.colorCount,
  );

  room.grid = grid;
  room.p1Cells = p1Cells;
  room.p2Cells = p2Cells;
  room.p1Color = p1Color;
  room.p2Color = p2Color;
  room.status = 'playing';
  room.p1Moves = 0;
  room.p2Moves = 0;
  room.movesCount = 0;
  room.lastGains = { 1: 0, 2: 0 };
  room.rematchRequestedBy = null;
  room.resetProposal = null;
  room.lastActive = Date.now();
}

// Propose Reset / Rematch (Requires Opponent Approval)
app.post('/api/rooms/:roomId/propose-reset', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role, targetStage, newGridSize, newColorCount } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  // If match is over and opponent already requested rematch, auto-accept immediately!
  if (
    room.rematchRequestedBy !== null &&
    room.rematchRequestedBy !== role &&
    room.status !== 'playing'
  ) {
    executeNextRound(room, targetStage, newGridSize, newColorCount);
    const sanitized = sanitizeRoomState(room);
    broadcastRoom(room, {
      type: 'reset_accepted',
      roomState: sanitized,
    });
    res.json({ roomState: sanitized, approved: true });
    return;
  }

  const proposal: ResetProposal = {
    requestedBy: Number(role) === 1 ? 1 : 2,
    targetStage: targetStage ? Number(targetStage) : undefined,
    newGridSize: newGridSize ? Number(newGridSize) : undefined,
    newColorCount: newColorCount ? Number(newColorCount) : undefined,
    timestamp: Date.now(),
  };

  room.resetProposal = proposal;
  room.rematchRequestedBy = proposal.requestedBy;
  room.lastActive = Date.now();

  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'reset_proposed',
    proposal,
    roomState: sanitized,
  });

  res.json({ roomState: sanitized, waitingApproval: true });
});

// Accept Reset
app.post('/api/rooms/:roomId/accept-reset', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  const proposal = room.resetProposal;
  const targetStage = proposal?.targetStage;
  const newGridSize = proposal?.newGridSize;
  const newColorCount = proposal?.newColorCount;

  executeNextRound(room, targetStage, newGridSize, newColorCount);

  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'reset_accepted',
    acceptedBy: role,
    roomState: sanitized,
  });

  res.json({ roomState: sanitized, success: true });
});

// Decline Reset
app.post('/api/rooms/:roomId/decline-reset', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  const declinedRole = Number(role) === 1 ? 1 : 2;
  room.resetProposal = null;
  room.rematchRequestedBy = null;
  room.lastActive = Date.now();

  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'reset_declined',
    declinedBy: declinedRole,
    roomState: sanitized,
  });

  res.json({ roomState: sanitized, declined: true });
});

// Legacy rematch route that triggers the approval flow or completes mutual rematch
app.post('/api/rooms/:roomId/rematch', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role = 1 } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  // If opponent already requested rematch, execute next round!
  if (room.rematchRequestedBy !== null && room.rematchRequestedBy !== role) {
    executeNextRound(room);
    const sanitized = sanitizeRoomState(room);
    broadcastRoom(room, {
      type: 'reset_accepted',
      roomState: sanitized,
    });
    res.json({ roomState: sanitized });
    return;
  }

  // Otherwise record as proposal and await opponent approval
  room.rematchRequestedBy = Number(role);
  room.resetProposal = {
    requestedBy: Number(role) === 1 ? 1 : 2,
    timestamp: Date.now(),
  };
  room.lastActive = Date.now();

  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'reset_proposed',
    proposal: room.resetProposal,
    roomState: sanitized,
  });

  res.json({ roomState: sanitized });
});

// Update Room Settings (Theme, Mode, Difficulty)
app.post('/api/rooms/:roomId/settings', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { themeId, gridSize, colorCount, challengeType } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  if (themeId) room.themeId = String(themeId);
  if (challengeType)
    room.challengeType = challengeType === 'progressive' ? 'progressive' : 'standard';
  if (gridSize && room.challengeType !== 'progressive') room.gridSize = Number(gridSize);
  if (colorCount && room.challengeType !== 'progressive')
    room.colorCount = Number(colorCount);

  room.lastActive = Date.now();
  const sanitized = sanitizeRoomState(room);
  broadcastRoom(room, {
    type: 'settings_updated',
    roomState: sanitized,
  });

  res.json({ roomState: sanitized });
});

// Leave Room
app.post('/api/rooms/:roomId/leave', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role, playerToken } = req.body;
  const room = rooms.get(roomId);

  if (room) {
    if (role === 1 || playerToken === room.p1.id) {
      // Host left: close the room
      broadcastRoom(room, {
        type: 'player_left',
        role: 1,
        message: 'Host has closed the room.',
      });
      rooms.delete(roomId);
    } else if (role === 2 || (room.p2 && playerToken === room.p2.id)) {
      // Player 2 left: free up slot so room returns to waiting
      broadcastRoom(room, {
        type: 'player_left',
        role: 2,
        message: 'Player 2 left the room.',
      });
      room.p2 = null;
      room.status = 'waiting';
      room.lastActive = Date.now();
    }
  }
  res.json({ success: true });
});

// Emote Reaction Endpoint
app.post('/api/rooms/:roomId/emote', (req, res) => {
  const roomId = req.params.roomId.toUpperCase().trim();
  const { role, emoji } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  const emotePayload = {
    role: Number(role) === 1 ? (1 as const) : (2 as const),
    emoji: String(emoji || '👏').slice(0, 10),
    id: Date.now(),
  };

  room.lastEmote = emotePayload;
  room.lastActive = Date.now();

  broadcastRoom(room, {
    type: 'player_emote',
    emote: emotePayload,
  });

  res.json({ success: true, emote: emotePayload });
});

// --- WebSocket Handling on /api/ws ---

server.on('upgrade', (request, socket, head) => {
  const url = request.url ? new URL(request.url, `http://${request.headers.host}`) : null;
  if (url && url.pathname === '/api/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws: WebSocket) => {
  let boundRoomId: string | null = null;
  let boundRole: 1 | 2 | null = null;

  ws.on('message', (msgRaw: string) => {
    try {
      const data = JSON.parse(msgRaw.toString());
      const { type } = data;

      if (type === 'bind_player') {
        const { roomId, role } = data;
        const room = rooms.get(String(roomId).toUpperCase().trim());
        if (room) {
          boundRoomId = room.roomId;
          boundRole = role;
          if (role === 1) {
            room.p1.ws = ws;
            room.p1.connected = true;
          } else if (room.p2 && role === 2) {
            room.p2.ws = ws;
            room.p2.connected = true;
          }
          ws.send(
            JSON.stringify({ type: 'bound_success', roomState: sanitizeRoomState(room) }),
          );
        }
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    if (boundRoomId && boundRole) {
      const room = rooms.get(boundRoomId);
      if (room) {
        if (boundRole === 1) room.p1.connected = false;
        if (boundRole === 2 && room.p2) room.p2.connected = false;
        broadcastRoom(room, {
          type: 'player_disconnected',
          role: boundRole,
          roomState: sanitizeRoomState(room),
        });
      }
    }
  });
});

// --- Vite Middleware in Dev or Static Serve in Prod ---

const isProduction = process.env.NODE_ENV === 'production';
const distPath = path.resolve(__dirname, 'dist');

async function startServer() {
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
