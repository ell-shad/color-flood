import { useEffect, useRef, useState } from 'react';

/**
 * Sizes the square play board from its real container width and the viewport
 * height.
 *
 * The old fixed `min(88vw, 40vh, 380px)` left a small board on tall windows
 * and, combined with a stretched column, big dead bands. The board now takes
 * the full column width unless the viewport is too short, in which case it
 * shrinks so the HUD, board and palette always fit on screen.
 *
 * `chromePx` is the vertical space owned by the header, HUD, palette, footer
 * and gaps — everything except the board itself.
 */
export function useBoardFit<T extends HTMLElement>(chromePx = 200, maxPx = 560) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const width = el.getBoundingClientRect().width;
      if (!width) return;
      const height = window.innerHeight - chromePx;
      setSize(Math.max(150, Math.min(maxPx, Math.floor(Math.min(width, height)))));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [chromePx, maxPx]);

  return [ref, size] as const;
}
