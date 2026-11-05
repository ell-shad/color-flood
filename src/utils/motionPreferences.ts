/**
 * P5.5: honors the OS "reduce motion" accessibility setting.
 *
 * `prefersReducedMotionSnapshot()` answers the CURRENT setting for
 * effect-time decisions (e.g. confetti bursts); the CSS side handles
 * running animations/transition durations via a media query in index.css,
 * and framer-motion scales transforms via `<MotionConfig reducedMotion>`.
 */

export const prefersReducedMotionSnapshot = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
