import { z } from 'zod';

/**
 * Shared WebSocket protocol for the server-authoritative online mode (Phase 3).
 *
 * ONE protocol, validated on both ends:
 *  - Clients send narrow, intent-only messages (no game state: the server owns it).
 *  - Every message carries `playerToken`; the server derives the role from the
 *    token — clients can never claim a role.
 *  - Every server→client state snapshot carries a per-room monotonic `version`.
 *
 * This module is imported by the server and the client (no runtime dependencies
 * beyond zod), so the wire format can never drift between them silently.
 */

// --- Shared scalars ---------------------------------------------------------

export const RoomId = z
  .string()
  .trim()
  .min(4)
  .max(8)
  .regex(/^[A-Z0-9]+$/);
export const Token = z.string().min(8).max(64);
export const PlayerName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((s) => s || 'Player');

export const GridSize = z
  .number()
  .int()
  .refine((v) => [10, 12, 14, 16, 18].includes(v));
export const ColorCount = z
  .number()
  .int()
  .refine((v) => [4, 5, 6, 7, 8].includes(v));
export const ChallengeType = z.enum(['standard', 'progressive']);
export const ThemeId = z.string().trim().min(1).max(32);
export const Emoji = z.string().max(10);

// --- Client → Server --------------------------------------------------------

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),

  z.object({
    type: z.literal('create_room'),
    playerName: PlayerName.optional(),
    gridSize: GridSize.optional(),
    colorCount: ColorCount.optional(),
    challengeType: ChallengeType.optional(),
    themeId: ThemeId.optional(),
  }),

  z.object({
    type: z.literal('join_room'),
    roomId: RoomId,
    playerName: PlayerName.optional(),
    // Optional: reconnect of a known player (role derived from token, never
    // from the client's claim — P3.7).
    playerToken: Token.optional(),
  }),

  z.object({
    type: z.literal('resume'),
    roomId: RoomId,
    playerToken: Token,
  }),

  z.object({
    type: z.literal('move'),
    roomId: RoomId,
    playerToken: Token,
    color: z.number().int().min(0).max(15),
  }),

  z.object({
    type: z.literal('propose_reset'),
    roomId: RoomId,
    playerToken: Token,
    targetStage: z.number().int().min(1).max(5).optional(),
    newGridSize: GridSize.optional(),
    newColorCount: ColorCount.optional(),
  }),

  z.object({ type: z.literal('accept_reset'), roomId: RoomId, playerToken: Token }),
  z.object({ type: z.literal('decline_reset'), roomId: RoomId, playerToken: Token }),

  z.object({
    type: z.literal('settings'),
    roomId: RoomId,
    playerToken: Token,
    themeId: ThemeId.optional(),
    gridSize: GridSize.optional(),
    colorCount: ColorCount.optional(),
    challengeType: ChallengeType.optional(),
  }),

  z.object({ type: z.literal('leave'), roomId: RoomId, playerToken: Token }),
  z.object({
    type: z.literal('emote'),
    roomId: RoomId,
    playerToken: Token,
    emoji: Emoji,
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// --- Server → Client --------------------------------------------------------

import type { OnlineRoomState } from '../src/types';

/** A sanitized room snapshot with the room's monotonic version. */
export interface RoomSnapshot {
  version: number;
  myRole: 1 | 2 | null; // set on the per-socket envelope, null on broadcasts
  roomState: OnlineRoomState;
}

export type ServerMessage =
  | { type: 'pong' }
  | {
      type: 'room_created' | 'room_joined' | 'resumed';
      roomId: string;
      role: 1 | 2;
      playerToken: string;
      snapshot: RoomSnapshot;
    }
  | {
      type:
        | 'state_update'
        | 'match_started'
        | 'move_made'
        | 'reset_proposed'
        | 'reset_accepted'
        | 'reset_declined'
        | 'settings_updated'
        | 'player_disconnected'
        | 'player_left';
      snapshot: RoomSnapshot;
    }
  | { type: 'player_emote'; emote: { role: 1 | 2; emoji: string; id: number } }
  | { type: 'error'; code: string; message: string };

export type ServerErrorCode =
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'not_authenticated'
  | 'not_your_turn'
  | 'not_active'
  | 'bad_color'
  | 'no_proposal'
  | 'settings_locked'
  | 'too_fast';
