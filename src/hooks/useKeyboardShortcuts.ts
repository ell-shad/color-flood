import { useEffect, useRef } from 'react';

/**
 * P5.2: keyboard shortcuts, bound once per mount.
 *
 *   1–8   play color index (solo + local/bot; online moves are issued
 *         through the same facade so legality is still enforced)
 *   H     smart hint (only in modes that expose the hint system)
 *   U     solo undo, one step
 *   R     restart (mode-aware: solo re-board, local/bot next round,
 *         online reset PROPOSAL — never an instant destructive action)
 *   Esc   close the top-most app-level modal/drawer
 *
 * Typing in any form field or editing text suppresses all of them.
 */

export interface KeyboardShortcutHandlers {
  /** Max legal color digit, i.e. the palette size (2..8). */
  colorCount: number;
  pickColor: (colorIndex: number) => void;
  getHint: () => void;
  /** Solo undo; only invoked when `undoAvailable` says it's legal. */
  undo: () => void;
  undoAvailable: boolean;
  restart: () => void;
  /** Escape: close any open app-level modal; the handler no-ops if none. */
  closeTopModal: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  // One stable listener + a ref bag: shortcuts never re-subscribe, and every
  // key press dispatches the freshest closures.
  const bagRef = useRef(handlers);
  useEffect(() => {
    bagRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const bag = bagRef.current;

      if (e.key === 'Escape') {
        bag.closeTopModal();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        bag.getHint();
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        if (bag.undoAvailable) bag.undo();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        bag.restart();
        return;
      }
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= bag.colorCount) {
        bag.pickColor(digit - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
