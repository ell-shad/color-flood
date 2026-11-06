/**
 * P5.7: mobile haptics.
 *
 * Tiny vibration cues on move/win/lose for devices with a vibrator
 * (Android phones; iOS Safari has no vibrate API and simply no-ops).
 * Vibration is presentation, not motion animation — it is NOT gated by
 * prefers-reduced-motion, but it does honor the same mute-by-device
 * story: nothing here fires when the game is muted (haptics ride along
 * with sounds, one switch, predictable).
 */

const hasVibrate = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** A move was played: single short tick. */
export const hapticMove = (muted: boolean): void => {
  if (muted || !hasVibrate()) return;
  navigator.vibrate(8);
};

/** Round/game won: ta-da pattern. */
export const hapticWin = (muted: boolean): void => {
  if (muted || !hasVibrate()) return;
  navigator.vibrate([24, 60, 24, 60, 48]);
};

/** Round/game lost: descending pair. */
export const hapticLose = (muted: boolean): void => {
  if (muted || !hasVibrate()) return;
  navigator.vibrate([40, 80, 90]);
};

/** Turn arrives (online): double tick. */
export const hapticTurn = (muted: boolean): void => {
  if (muted || !hasVibrate()) return;
  navigator.vibrate([12, 70, 12]);
};
