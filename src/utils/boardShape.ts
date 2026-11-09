import type { BoardShape } from '../types';

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
    default:
      return assertNever(shape);
  }
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
    default:
      return 'classic';
  }
}
