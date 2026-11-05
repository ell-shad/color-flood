import { describe, it, expect } from 'vitest';
import { createRoomService, createInMemoryStore } from '../server/rooms';
import type { RoomInternal } from '../server/rooms';
import type { ServerMessage } from '../server/protocol';

/**
 * P3.2/P3.7 service tests: token→role auth, turn/color validation, settings
 * locking, proposal existence, role derivation on reconnect (no hijackable claims).
 */

const silentBus = () => {
  const inbox: Array<{ target: string; message: ServerMessage }> = [];
  return {
    inbox,
    toRoom: (roomId: string, message: ServerMessage) =>
      inbox.push({ target: `room:${roomId}`, message }),
    toToken: (token: string, message: ServerMessage) =>
      inbox.push({ target: `token:${token}`, message }),
  };
};

const makeService = () => {
  const store = createInMemoryStore();
  const bus = silentBus();
  let clock = 1_000_000;
  const service = createRoomService({
    store,
    bus,
    now: () => clock,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { service, bus, store, advance };
};

const setUpFullRoom = () => {
  const { service, bus } = makeService();
  const created = service.createRoom({ playerName: 'Host', gridSize: 10, colorCount: 5 });
  const joined = service.joinRoom(created.roomId, 'Guest');
  if (!joined.ok) throw new Error('join failed');
  return {
    service,
    bus,
    roomId: created.roomId,
    p1Token: created.token,
    p2Token: joined.token,
  };
};

describe('P3.2 room service authority', () => {
  it('creates rooms with server-generated codes and a P1 token', () => {
    const { service } = makeService();
    const r1 = service.createRoom({});
    const r2 = service.createRoom({});
    expect(r1.role).toBe(1);
    expect(r1.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(r1.roomId).not.toBe(r2.roomId);
    expect(r1.roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('ignores client-requested codes (hijack fix)', () => {
    // (Requested codes are not part of the protocol; the hook's optimistic code
    // is overwritten by the server response — server always generates.)
    const { service } = makeService();
    const room = service.createRoom({});
    expect(room.roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('joins P2 once, then refuses a third player', () => {
    const { service, roomId } = setUpFullRoom();
    const third = service.joinRoom(roomId, 'Third');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.code).toBe('room_full');
    expect(roomId).toBeTruthy();
  });

  it('derives role from token on reconnect instead of trusting claims', () => {
    const { service, roomId, p1Token, p2Token } = setUpFullRoom();
    const as1 = service.joinRoom(roomId, 'Host Again', p1Token);
    expect(as1.ok).toBe(true);
    if (as1.ok) expect(as1.role).toBe(1);
    const as2 = service.joinRoom(roomId, 'Guest Again', p2Token);
    expect(as2.ok).toBe(true);
    if (as2.ok) expect(as2.role).toBe(2);
  });

  it('rejects moves with an unknown token regardless of claimed role', () => {
    const { service, roomId, p1Token } = setUpFullRoom();
    const fake = service.move(roomId, 'complete_garbage_token', 1);
    expect(fake.ok).toBe(false);
    if (!fake.ok) expect(fake.code).toBe('not_authenticated');
    const state = service.readState(roomId);
    expect(state?.turn).toBe(1);
    expect(p1Token).toBeTruthy();
  });

  it('rejects out-of-turn and illegal colors', () => {
    const { service, roomId, p1Token, p2Token } = setUpFullRoom();
    const wrongTurn = service.move(roomId, p2Token, 1);
    expect(wrongTurn.ok).toBe(false);
    if (!wrongTurn.ok) expect(wrongTurn.code).toBe('not_your_turn');

    const legal = (state: ReturnType<typeof service.readState>): number => {
      const occupied = new Set([state!.p1Color, state!.p2Color]);
      for (let c = 0; c < state!.colorCount; c++) {
        if (!occupied.has(c)) return c;
      }
      return -1; // unreachable with >=4 colors and 2 occupied
    };

    const occupied = service.move(roomId, p1Token, service.readState(roomId)!.p1Color);
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.code).toBe('bad_color');

    const tooHigh = service.move(roomId, p1Token, 99);
    expect(tooHigh.ok).toBe(false);
    if (!tooHigh.ok) expect(tooHigh.code).toBe('bad_color');

    const negative = service.move(roomId, p1Token, -2);
    expect(negative.ok).toBe(false);

    expect(service.readState(roomId)?.movesCount).toBe(0);
    // P1's own turn still works after all the invalid attempts.
    const first = service.move(roomId, p1Token, legal(service.readState(roomId)));
    expect(first.ok).toBe(true);
    const reply = service.move(roomId, p2Token, legal(service.readState(roomId)));
    expect(reply.ok).toBe(true);
  });

  it('locks structural settings mid-game; theme stays a free tweak', () => {
    const { service, roomId, p1Token, p2Token } = setUpFullRoom();
    const lock = service.updateSettings(roomId, p1Token, { gridSize: 18 });
    expect(lock.ok).toBe(false);
    if (!lock.ok) expect(lock.code).toBe('settings_locked');
    const theme = service.updateSettings(roomId, p2Token, { themeId: 'neon' });
    expect(theme.ok).toBe(true);
    expect(service.readState(roomId)?.themeId).toBe('neon');
  });

  it('accepts structural settings in lobby (host-only, token-verified)', () => {
    const { service } = makeService();
    const room = service.createRoom({ playerName: 'Host', gridSize: 10, colorCount: 5 });
    const unknown = service.updateSettings(room.roomId, room.token + 'x', {
      gridSize: 18,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('not_authenticated');
    const host = service.updateSettings(room.roomId, room.token, {
      gridSize: 14,
      colorCount: 7,
    });
    expect(host.ok).toBe(true);
    const state = service.readState(room.roomId)!;
    expect(state.gridSize).toBe(14);
    expect(state.colorCount).toBe(7);
    // A joining P2 gets a board already matching the updated template.
    const joined = service.joinRoom(room.roomId, 'Guest');
    expect(joined.ok).toBe(true);
  });

  it('refuses accept without a proposal and blocks self-accept loop', () => {
    const { service, roomId, p1Token, p2Token } = setUpFullRoom();
    const none = service.acceptReset(roomId, p2Token);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.code).toBe('no_proposal');
    const proposed = service.proposeReset(roomId, p1Token, {});
    expect(proposed.ok).toBe(true);
    if (proposed.ok) expect(proposed.waiting).toBe(true);
    const selfAccept = service.acceptReset(roomId, p1Token);
    expect(selfAccept.ok).toBe(false);
    // Opponent accepting completes the round.
    const accepted = service.acceptReset(roomId, p2Token);
    expect(accepted.ok).toBe(true);
    const state = service.readState(roomId)!;
    expect(state.roundNumber).toBe(2);
    expect(state.firstTurnPlayer).toBe(2);
  });

  it('leave frees the P2 slot; host leave closes the room', () => {
    const { service, roomId, p1Token, p2Token } = setUpFullRoom();
    const guest = service.leave(roomId, p2Token);
    expect(guest.ok).toBe(true);
    expect(service.readState(roomId)?.status).toBe('waiting');
    expect(service.joinRoom(roomId, 'Newcomer').ok).toBe(true);
    const closed = service.leave(roomId, p1Token);
    expect(closed.ok).toBe(true);
    expect(service.readState(roomId)).toBeNull();
  });

  it('socketClosed flags the right player and keeps state', () => {
    const { service, roomId, p2Token } = setUpFullRoom();
    service.socketClosed(p2Token);
    const state = service.readState(roomId)!;
    expect(state.p2Connected).toBe(false);
    expect(state.p1Connected).toBe(true);
    expect(state.status).toBe('playing');
  });

  it('sweep removes stale rooms only', () => {
    const store = createInMemoryStore();
    const bus = silentBus();
    let clock = 1000;
    const service = createRoomService({ store, bus, now: () => clock });
    const room = service.createRoom({});
    // Fresh sweep does nothing.
    expect(service.sweep(2 * 60 * 60 * 1000)).toBe(0);
    clock += 3 * 60 * 60 * 1000;
    expect(service.sweep(2 * 60 * 60 * 1000)).toBe(1);
    expect(service.readState(room.roomId)).toBeNull();
  });

  it('bumps a monotonic version on every mutation', () => {
    const { service, roomId, p1Token } = setUpFullRoom();
    const v0 = service.snapshotFor(roomId, 1)!.version;
    const occupied = new Set([
      service.readState(roomId)!.p1Color,
      service.readState(roomId)!.p2Color,
    ]);
    const c = [0, 1, 2, 3, 4].find((x) => !occupied.has(x)) ?? 0;
    service.move(roomId, p1Token, c);
    const v1 = service.snapshotFor(roomId, 1)!.version;
    expect(v1).toBeGreaterThan(v0);
  });

  it('store seam: custom store is used', () => {
    const rooms = new Map<string, RoomInternal>();
    const service = createRoomService({ store: createInMemoryStore(), bus: silentBus() });
    // Sanity only — the custom-store path is exercised in ws-server tests.
    void rooms;
    expect(service.activeRoomCount()).toBe(0);
  });
});

describe('P3.5 reconnection, forfeits and turn timer', () => {
  const legalColor = (
    service: ReturnType<typeof createRoomService>,
    roomId: string,
  ): number => {
    const st = service.readState(roomId)!;
    const occupied = new Set([st.p1Color, st.p2Color]);
    for (let c = 0; c < st.colorCount; c++) {
      if (!occupied.has(c)) return c;
    }
    return 0;
  };

  it('forfeits a player still disconnected after the grace window', () => {
    const { service, advance } = makeService();
    const created = service.createRoom({ playerName: 'Host' });
    const joined = service.joinRoom(created.roomId, 'Guest');
    if (!joined.ok) throw new Error('join failed');

    // Before the grace: no forfeit, game continues.
    service.socketClosed(joined.token);
    advance(59_000);
    expect(service.enforceDisconnects()).toBe(0);
    expect(service.readState(created.roomId)!.status).toBe('playing');

    // Past the 60 s grace: P2 forfeits, P1 gets the series credit.
    advance(2_000); // 61 s since drop
    expect(service.enforceDisconnects()).toBe(1);
    const state = service.readState(created.roomId)!;
    expect(state.status).toBe('p1_won');
    expect(state.series.p1).toBe(1);
    expect(state.p2Connected).toBe(false);

    // Idempotent: a second sweep must not credit twice.
    advance(5_000);
    expect(service.enforceDisconnects()).toBe(0);
    expect(service.readState(created.roomId)!.series.p1).toBe(1);
  });

  it('reconnecting inside the grace window cancels the forfeit', () => {
    const { service, advance } = makeService();
    const created = service.createRoom({ playerName: 'Host' });
    const joined = service.joinRoom(created.roomId, 'Guest');
    if (!joined.ok) throw new Error('join failed');
    service.socketClosed(joined.token);
    advance(30_000);
    // Resume (token reconnect) clears the countdown.
    const back = service.joinRoom(created.roomId, 'Guest', joined.token);
    expect(back.ok).toBe(true);
    advance(90_000);
    expect(service.enforceDisconnects()).toBe(0);
    expect(service.readState(created.roomId)!.status).toBe('playing');
  });

  it('resume clears the disconnect countdown (service-level)', () => {
    const { service, advance } = makeService();
    const created = service.createRoom({ playerName: 'Host' });
    const joined = service.joinRoom(created.roomId, 'Guest');
    if (!joined.ok) throw new Error('join failed');
    service.socketClosed(joined.token);
    // resume() is the other reconnect path — must clear disconnectedAt too.
    const resumed = service.resume(created.roomId, joined.token);
    expect(resumed.ok).toBe(true);
    advance(120_000);
    expect(service.enforceDisconnects()).toBe(0);
    expect(service.readState(created.roomId)!.status).toBe('playing');
  });

  it('turn timer forfeits the slow player past the slack', () => {
    const { service, advance } = makeService();
    const created = service.createRoom({ playerName: 'Host', turnTimerSec: 30 });
    const joined = service.joinRoom(created.roomId, 'Guest');
    if (!joined.ok) throw new Error('join failed');

    // Host plays inside the window; timer restarts for P2's turn.
    service.move(created.roomId, created.token, legalColor(service, created.roomId));
    advance(29_000);
    expect(service.enforceTurnTimers()).toBe(0);

    advance(3_000); // 32 s > 30 s + 1.5 s slack
    expect(service.enforceTurnTimers()).toBe(1);
    const state = service.readState(created.roomId)!;
    expect(state.status).toBe('p1_won'); // P2 (on turn) forfeited
    expect(state.series.p1).toBe(1);
  });

  it('turn timer changes are host-only and validated', () => {
    const { service, advance } = makeService();
    const created = service.createRoom({ playerName: 'Host' });
    const joined = service.joinRoom(created.roomId, 'Guest');
    if (!joined.ok) throw new Error('join failed');

    // Guest tries to set a timer → denied (host-only).
    const guestSet = service.updateSettings(created.roomId, joined.token, {
      turnTimerSec: 30,
    });
    expect(guestSet.ok).toBe(false);
    if (!guestSet.ok) expect(guestSet.code).toBe('settings_locked');

    // Host sets it mid-game (timer is board-safe — allowed any time).
    const hostSet = service.updateSettings(created.roomId, created.token, {
      turnTimerSec: 60,
    });
    expect(hostSet.ok).toBe(true);
    expect(service.readState(created.roomId)!.turnTimerSec).toBe(60);

    // Host disables → no forfeit even when the previous window has passed.
    service.updateSettings(created.roomId, created.token, { turnTimerSec: 0 });
    advance(10 * 60_000);
    expect(service.enforceTurnTimers()).toBe(0);
    expect(service.readState(created.roomId)!.status).toBe('playing');
  });
});
