import type { BoardShape, GameMode } from '../types';

/**
 * P11.1: exhaustive board-shape predicates.
 *
 * Adding a new BoardShape is intended to be a compile-time exercise: every
 * place that has to distinguish classic and wheel uses one of these helpers
 * (or a switch ending in `assertNever`), so the new value becomes a type
 * error instead of silently falling through to classic behavior.
 */
export function assertNever(value: never, subject = 'board shape'): never {
  throw new Error(`Unhandled ${subject}: ${String(value)}`);
}

/** True for the polar wheel topology, false for the classic square. */
export function isWheel(shape: BoardShape): boolean {
  switch (shape) {
    case 'classic':
      return false;
    case 'wheel':
      return true;
    case 'cube':
    case 'mosaic':
      return false;
    default:
      return assertNever(shape);
  }
}

/**
 * True for the planar topologies. The emoji skin is flat-board only: the 3D
 * cube keeps its colour fills so the flood reads on a projected surface.
 */
export function isFlatShape(shape: BoardShape): boolean {
  switch (shape) {
    case 'classic':
    case 'wheel':
    case 'mosaic':
      return true;
    case 'cube':
      return false;
    default:
      return assertNever(shape);
  }
}

/** True for the classic square topology. */
export function isClassic(shape: BoardShape): boolean {
  switch (shape) {
    case 'classic':
      return true;
    case 'wheel':
      return false;
    case 'cube':
    case 'mosaic':
      return false;
    default:
      return assertNever(shape);
  }
}

/** True for the cube-surface topology. */
export function isCube(shape: BoardShape): boolean {
  switch (shape) {
    case 'classic':
    case 'wheel':
    case 'mosaic':
      return false;
    case 'cube':
      return true;
    default:
      return assertNever(shape);
  }
}

/** P13: irregular polygonal tiling (solo only, like the cube). */
export function isMosaic(shape: BoardShape): boolean {
  switch (shape) {
    case 'classic':
    case 'wheel':
    case 'cube':
      return false;
    case 'mosaic':
      return true;
    default:
      return assertNever(shape);
  }
}

/**
 * True for topologies that exist only in solo play. The cube surface is a solo
 * mode: its six-face seeding and territory markers are too hard to read with
 * two players on the same screen.
 */
export function isSoloOnlyShape(shape: BoardShape): boolean {
  return isCube(shape) || isMosaic(shape);
}

/**
 * The shape a game may actually play in `mode`. Multiplayer — local 2P, vs bot
 * and online — is flat-board only, so a stored `cube` preference falls back to
 * classic there instead of seeding a board the mode does not support.
 */
export function shapeForMode(shape: BoardShape, mode: GameMode): BoardShape {
  if (mode === 'solo') return shape;
  return isSoloOnlyShape(shape) ? 'classic' : shape;
}

/**
 * Parse an optional persisted/legacy shape value. Unknown values keep the
 * long-standing classic behavior (old snapshots and links predate shapes).
 * The strict share-link parser lives in shareLink.ts and still rejects bad
 * explicit values.
 */
export function parseBoardShape(raw: unknown): BoardShape {
  switch (raw) {
    case 'classic':
      return 'classic';
    case 'wheel':
      return 'wheel';
    case 'cube':
      return 'cube';
    case 'mosaic':
      return 'mosaic';
    default:
      return 'classic';
  }
}
