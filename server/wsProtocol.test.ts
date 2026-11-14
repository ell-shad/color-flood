import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { createAppServer } from '../server';
import type {
  ServerMessage,
  SessionAckMessage,
  StateUpdateMessage,
  EmoteMessage,
  ErrorMessage,
} from './protocol';

/**
 * P3.8: two live WebSocket clients against the real composition (ephemeral
 * port). Includes the cheating matrix: wrong turn, forged token (roles cannot
 * be claimed — tokens ARE identity), illegal colors, oversized frames,
 * unauthenticated ops, rate limiting, settings locking, and proposal flows.
 */

const instance = createAppServer();

beforeAll(async () => {
  await instance.listen(0);
});

afterAll(async () => {
  await instance.stop();
});

class TestClient {
  ws: WebSocket;
  private queue: ServerMessage[] = [];
  private waiters: Array<{
    type: string;
    resolve: (m: ServerMessage) => void;
  }> = [];
  private closed: { code: number; done: boolean } = { code: 0, done: false };
  private closeWaiters: Array<() => void> = [];

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const raw = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
      const client = new TestClient(raw);
      raw.on('open', () => resolve(client));
      raw.on('error', reject);
      raw.on('message', (data) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (client.closed.done) return;
        const m = msg as ServerMessage;
        const waiterIdx = client.waiters.findIndex((w) => w.type === m.type);
        if (waiterIdx >= 0) {
          const [w] = client.waiters.splice(waiterIdx, 1);
          w.resolve(m);
        } else {
          client.queue.push(m);
        }
      });
      raw.on('close', (code) => {
        client.closed = { code, done: true };
        client.closeWaiters.forEach((fn) => fn());
      });
    });
  }

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  /** Bounded wait for a message of this type (arriving later or already queued). */
  async expect(type: string, timeoutMs = 5000): Promise<ServerMessage> {
    const queued = this.queue.findIndex((m) => m.type === type);
    if (queued >= 0) return this.queue.splice(queued, 1)[0];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for "${type}"`)),
        timeoutMs,
      );
      this.waiters.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  send(msg: object) {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(bytes: Buffer) {
    this.ws.send(bytes);
  }

  async waitForClose(): Promise<number> {
    if (this.closed.done) return this.closed.code;
    return new Promise((resolve) => {
      this.closeWaiters.push(() => resolve(this.closed.code));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

const port = () => (instance.server.address() as AddressInfo).port;

const bootRoom = async () => {
  const host = await TestClient.connect(port());
  host.send({ type: 'create_room', playerName: 'Host', gridSize: 10, colorCount: 4 });
  const created = (await host.expect('room_created')) as SessionAckMessage;
  const guest = await TestClient.connect(port());
  guest.send({ type: 'join_room', roomId: created.roomId, playerName: 'Guest' });
  const joined = (await guest.expect('room_joined')) as SessionAckMessage;
  await host.expect('match_started');
  return {
    host,
    guest,
    roomId: created.roomId,
    p1Token: created.playerToken,
    p2Token: joined.playerToken,
  };
};

/** First color that is neither player's color. */
const legalColor = (roomId: string): number => {
  const st = instance.service.readState(roomId)!;
  const occupied = new Set([st.p1Color, st.p2Color]);
  for (let c = 0; c < st.colorCount; c++) {
    if (!occupied.has(c)) return c;
  }
  return 0;
};

describe('P3.8 protocol integration (two live clients)', () => {
  it('create + join + move lifecycle with versioned broadcasts', async () => {
    const room = await bootRoom();
    const pre = instance.service.snapshotFor(room.roomId, null)!.version;
    room.host.send({
      type: 'move',
      roomId: room.roomId,
      playerToken: room.p1Token,
      color: legalColor(room.roomId),
    });
    await room.host.expect('move_made');
    const made = (await room.guest.expect('move_made')) as StateUpdateMessage;
    expect(made.snapshot.roomState.turn).toBe(2);
    expect(made.snapshot.roomState.movesCount).toBe(1);
    expect(made.snapshot.version).toBeGreaterThan(pre);
  });

  it('rejects wrong-turn moves with a clear error and no state change', async () => {
    const room = await bootRoom();
    const color = legalColor(room.roomId);
    room.guest.send({
      type: 'move',
      roomId: room.roomId,
      playerToken: room.p2Token,
      color,
    });
    const err = (await room.guest.expect('error')) as ErrorMessage;
    expect(err.code).toBe('not_your_turn');
    expect(instance.service.readState(room.roomId)!.movesCount).toBe(0);
  });

  it('rejects moves with a forged token (identity == token, roles not claimable)', async () => {
    const room = await bootRoom();
    room.guest.send({
      type: 'move',
      roomId: room.roomId,
      playerToken: 'forged_token_xxxx',
      color: legalColor(room.roomId),
    });
    const err = (await room.guest.expect('error')) as ErrorMessage;
    expect(err.code).toBe('not_authenticated');
    expect(instance.service.readState(room.roomId)!.movesCount).toBe(0);
  });

  it('rejects out-of-range colors', async () => {
    const room = await bootRoom();
    room.host.send({
      type: 'move',
      roomId: room.roomId,
      playerToken: room.p1Token,
      color: 42,
    });
    const err = (await room.host.expect('error')) as ErrorMessage;
    expect(err.code).toBe('bad_color');
  });

  it('closes sockets that send an oversized frame', async () => {
    const client = await TestClient.connect(port());
    client.sendRaw(Buffer.alloc(9 * 1024).fill(65));
    expect(await client.waitForClose()).toBe(1009);
  });

  it('rejects accept-reset when no proposal exists', async () => {
    const room = await bootRoom();
    room.guest.send({
      type: 'accept_reset',
      roomId: room.roomId,
      playerToken: room.p2Token,
    });
    const err = (await room.guest.expect('error')) as ErrorMessage;
    expect(err.code).toBe('no_proposal');
  });

  it('locks structural settings mid-game; cosmetic themes allowed', async () => {
    const room = await bootRoom();
    room.host.send({
      type: 'settings',
      roomId: room.roomId,
      playerToken: room.p1Token,
      gridSize: 18,
    });
    const err = (await room.host.expect('error')) as ErrorMessage;
    expect(err.code).toBe('settings_locked');
    room.guest.send({
      type: 'settings',
      roomId: room.roomId,
      playerToken: room.p2Token,
      themeId: 'neon',
    });
    await room.host.expect('settings_updated');
    expect(instance.service.readState(room.roomId)!.themeId).toBe('neon');
  });

  it('proposal → accept → next round over the socket', async () => {
    const room = await bootRoom();
    room.host.send({
      type: 'propose_reset',
      roomId: room.roomId,
      playerToken: room.p1Token,
    });
    await room.host.expect('reset_proposed');
    await room.guest.expect('reset_proposed');
    room.guest.send({
      type: 'accept_reset',
      roomId: room.roomId,
      playerToken: room.p2Token,
    });
    const accepted = (await room.guest.expect('reset_accepted')) as StateUpdateMessage;
    expect(accepted.snapshot.roomState.roundNumber).toBe(2);
    expect(accepted.snapshot.roomState.firstTurnPlayer).toBe(2);
    await room.host.expect('reset_accepted');
  });

  it('host leave closes the room for everyone', async () => {
    const room = await bootRoom();
    room.host.send({ type: 'leave', roomId: room.roomId, playerToken: room.p1Token });
    await room.guest.expect('player_left');
    expect(instance.service.readState(room.roomId)).toBeNull();
  });

  it('enforces the per-socket rate limit', async () => {
    const client = await TestClient.connect(port());
    for (let i = 0; i < 35; i++) {
      client.send({ type: 'ping' });
    }
    const err = await client.expect('error', 4000);
    expect((err as ErrorMessage).code).toBe('too_fast');
  });

  it('emotes broadcast with server-set role', async () => {
    const room = await bootRoom();
    room.guest.send({
      type: 'emote',
      roomId: room.roomId,
      playerToken: room.p2Token,
      emoji: '🎉',
    });
    const emote = (await room.host.expect('player_emote')) as EmoteMessage;
    expect(emote.emote.role).toBe(2);
    expect(emote.emote.emoji).toBe('🎉');
  });

  it('resume keeps role and restores state', async () => {
    const room = await bootRoom();
    const fresh = await TestClient.connect(port());
    fresh.send({ type: 'resume', roomId: room.roomId, playerToken: room.p1Token });
    const resumed = (await fresh.expect('resumed')) as SessionAckMessage;
    expect(resumed.role).toBe(1);
    expect(resumed.snapshot.roomState.status).toBe('playing');
    fresh.close();
  });

  it('malformed messages get bad_message, not a crash', async () => {
    const client = await TestClient.connect(port());
    client.sendRaw(Buffer.from('not json at all'));
    const err = (await client.expect('error')) as ErrorMessage;
    expect(err.code).toBe('bad_message');
    client.send({ type: 'move', roomId: '!!!!', playerToken: '1234567890', color: 0 });
    const err2 = (await client.expect('error')) as ErrorMessage;
    expect(err2.code).toBe('bad_message');
  });
});

describe('P12 solo-only shapes over the wire', () => {
  it('serves a flat room when a client asks for the cube', async () => {
    const host = await TestClient.connect(port());
    host.send({
      type: 'create_room',
      playerName: 'Host',
      gridSize: 10,
      colorCount: 4,
      shape: 'cube',
    });
    const created = (await host.expect('room_created')) as SessionAckMessage;
    const roomId = created.roomId;
    const room = instance.service.readState(roomId)!;
    expect(room.shape).toBe('classic');
    expect(room.grid).toHaveLength(10);

    const guest = await TestClient.connect(port());
    guest.send({ type: 'join_room', roomId, playerName: 'Guest' });
    const joined = (await guest.expect('room_joined')) as SessionAckMessage;
    expect(joined.role).toBe(2);
    const started = (await host.expect('match_started')) as StateUpdateMessage;
    expect(started.snapshot.roomState.shape).toBe('classic');

    host.send({
      type: 'move',
      roomId,
      playerToken: created.playerToken,
      color: legalColor(roomId),
    });
    const made = (await guest.expect('move_made')) as StateUpdateMessage;
    expect(made.snapshot.roomState.shape).toBe('classic');
    expect(made.snapshot.roomState.movesCount).toBe(1);
    expect(made.snapshot.roomState.turn).toBe(2);
  });

  it('forwards shape updates via WS settings in the waiting lobby', async () => {
    const host = await TestClient.connect(port());
    host.send({
      type: 'create_room',
      playerName: 'Host',
      gridSize: 10,
      colorCount: 4,
      shape: 'classic',
    });
    const created = (await host.expect('room_created')) as SessionAckMessage;
    host.send({
      type: 'settings',
      roomId: created.roomId,
      playerToken: created.playerToken,
      shape: 'triangle',
      gridSize: 12,
    });
    const updated = (await host.expect('settings_updated')) as StateUpdateMessage;
    expect(updated.snapshot.roomState.shape).toBe('triangle');
    expect(updated.snapshot.roomState.gridSize).toBe(12);
    // Triangle ladder size 12 produces 6 rows x 24 cols
    expect(updated.snapshot.roomState.grid).toHaveLength(6);
    expect(updated.snapshot.roomState.grid[0]).toHaveLength(24);
    host.close();
  });
});
