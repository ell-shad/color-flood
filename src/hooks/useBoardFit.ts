import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Sizes the square play board from the space the play column actually has.
 *
 * The board used to be a fixed `min(88vw, 40vh, 380px)` box. The redesign made
 * it fill the column, and deriving that from `window.innerHeight - chrome` was
 * both guessy and unstable: one pixel too tall shows the root scrollbar, the
 * narrower column shrinks the board, the scrollbar disappears, the board grows
 * again — a layout loop that reads as flicker.
 *
 * So this measures the play column itself and subtracts the measured height of
 * its siblings (HUD, palette, reaction bar). None of those depend on the board,
 * so the result converges instead of feeding back into the layout.
 *
 * Put `ref` on the board slot — the play column is its parent.
 */
export function useBoardFit<T extends HTMLElement>(maxPx = 560) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(0);

  const measure = useCallback(() => {
    const slot = ref.current;
    const column = slot?.parentElement;
    if (!slot || !column) return;

    const rect = column.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // The slot is skipped on purpose: its height follows the size being
    // computed, so including it would make the measurement depend on itself.
    let overhead = 0;
    for (const child of Array.from(column.children)) {
      if (child === slot) continue;
      overhead += (child as HTMLElement).getBoundingClientRect().height;
    }
    const gap = parseFloat(getComputedStyle(column).rowGap) || 0;
    overhead += gap * Math.max(0, column.children.length - 1);

    const fit = Math.min(rect.width, rect.height - overhead);
    const next = Math.max(150, Math.min(maxPx, Math.floor(fit)));
    // Equality bailout: a re-measure that lands on the same size must not
    // re-render (that is what turns a layout read into a layout loop).
    setSize((prev) => (prev === next ? prev : next));
  }, [maxPx]);

  // Siblings mount/unmount (reaction bar, turn chip) and grow between renders
  // (stars, streak), so re-measure once after every shell render.
  useLayoutEffect(measure);

  useEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(column);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure]);

  return [ref, size] as const;
}
