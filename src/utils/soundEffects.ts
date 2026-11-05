import { loadBool, saveString } from './storage';

/**
 * P4.8 audio: ONE shared AudioContext (the old code built a new context per
 * call — each construction costs tens of ms and browsers cap them at ~50),
 * synthesized move / win / lose / emote blips, and a persisted mute toggle.
 *
 * Browsers block audio until a user gesture; every play call therefore resumes
 * the context when it is suspended (harmless if it is still locked).
 */

const STORAGE_KEY = 'muted';
const LEGACY_KEY = 'color-flood-muted';

let ctx: AudioContext | null = null;
let muted = loadBool(STORAGE_KEY, false, LEGACY_KEY);

export const isMuted = (): boolean => muted;

export const setMuted = (value: boolean): void => {
  muted = value;
  saveString(STORAGE_KEY, value ? 'true' : 'false');
};

const getCtx = (): AudioContext | null => {
  if (muted) return null;
  try {
    if (!ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

interface Tone {
  /** Hz at note start. */
  from: number;
  /** Hz at note end (equal to `from` for a flat tone). */
  to?: number;
  /** Seconds. */
  duration: number;
  /** Peak volume. */
  volume?: number;
  /** Oscillator waveform. */
  type?: OscillatorType;
  /** Seconds of silence before this tone starts. */
  delay?: number;
}

const playTones = (tones: Tone[]) => {
  const audio = getCtx();
  if (!audio) return;
  let offset = 0;
  for (const tone of tones) {
    try {
      const start = audio.currentTime + offset + (tone.delay ?? 0);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.from, start);
      if (tone.to !== undefined && tone.to !== tone.from) {
        osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
      }
      const peak = tone.volume ?? 0.1;
      gain.gain.setValueAtTime(peak, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(start + tone.duration);
    } catch {
      /* one bad tone must not kill the rest */
    }
    offset += 0; // tones overlap freely; ordering comes from `delay`
  }
};

/** Cell click / flood move: short, non-fatiguing tick. */
export const playMoveSound = (colorIndex = 0): void => {
  const base = 320 + (colorIndex % 8) * 40;
  playTones([
    { from: base, to: base * 0.85, duration: 0.07, volume: 0.06, type: 'triangle' },
  ]);
};

/** Match victory: quick rising arpeggio. */
export const playWinSound = (): void => {
  playTones([
    { from: 523, duration: 0.09, volume: 0.09, delay: 0 },
    { from: 659, duration: 0.09, volume: 0.09, delay: 0.09 },
    { from: 784, duration: 0.12, volume: 0.09, delay: 0.18 },
    { from: 1046, duration: 0.2, volume: 0.1, delay: 0.27 },
  ]);
};

/** Match defeat: soft descending minor third + low landing tone. */
export const playLoseSound = (): void => {
  playTones([
    { from: 392, duration: 0.14, volume: 0.08, delay: 0 },
    { from: 311, duration: 0.16, volume: 0.08, delay: 0.14 },
    { from: 208, duration: 0.3, volume: 0.08, delay: 0.3, type: 'triangle' },
  ]);
};

/** Emote pop (kept from the legacy implementation). */
export const playEmotePopSound = (): void => {
  playTones([{ from: 440, to: 780, duration: 0.12, volume: 0.12 }]);
};
