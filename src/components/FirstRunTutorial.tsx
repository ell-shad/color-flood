import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, MousePointerClick, Keyboard, Swords } from 'lucide-react';
import { isWheel } from '../utils/boardShape';
import type { BoardShape } from '../types';

/**
 * P5.7: first-run interactive tutorial.
 *
 * A dismissable 3-step coach-mark shown once per device (versioned storage
 * flag owned by App). It never blocks the game: step 1 asks the player to
 * make a REAL palette move and advances the moment the board has moved
 * (derived from `hasMadeFirstMove` — no effect needed); steps 2–3 cover the
 * move budget + keys and the other game modes.
 */

interface FirstRunTutorialProps {
  hasMadeFirstMove: boolean;
  onFinish: () => void;
  /** P7: solo board topology — the flood grows from the corner or the core. */
  boardShape?: BoardShape;
}

export const FirstRunTutorial: React.FC<FirstRunTutorialProps> = ({
  hasMadeFirstMove,
  onFinish,
  boardShape = 'classic' as BoardShape,
}) => {
  const [manualStep, setManualStep] = useState(0);
  // Step 0 auto-clears the moment the player actually floods one color —
  // derived, so the interaction itself completes the step.
  const step = hasMadeFirstMove && manualStep === 0 ? 1 : manualStep;

  const next = () => setManualStep(Math.min(step + 1, 2));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-28 z-40 w-[min(92vw,380px)] pointer-events-none"
    >
      <div className="pointer-events-auto bg-slate-900/95 border border-slate-750 rounded-2xl p-4 shadow-2xl relative">
        <button
          onClick={onFinish}
          aria-label="Skip tutorial"
          title="Skip tutorial"
          className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        {step === 0 && (
          <div className="space-y-2 pr-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-indigo-400 shrink-0" />
              <p className="text-[13px] font-bold text-white">Flood the board</p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tap a color swatch below (or press the keys{' '}
              <kbd className="px-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">
                1–8
              </kbd>
              ) — every touching cell of that color{' '}
              {isWheel(boardShape)
                ? 'joins the flood pouring out of the center core'
                : 'joins your flood from the top-left corner'}
              . <strong className="text-indigo-300">Try a move now!</strong>
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2 pr-6">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[13px] font-bold text-white">Beat the move budget</p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Cover every cell before the counter hits the limit.
              <span className="hidden sm:inline">
                {' '}
                Keys:{' '}
                <kbd className="px-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">
                  U
                </kbd>{' '}
                undo a move ·{' '}
                <kbd className="px-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">
                  H
                </kbd>{' '}
                hint (when enabled) ·{' '}
                <kbd className="px-1 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">
                  R
                </kbd>{' '}
                restart.
              </span>
              <span className="sm:hidden"> The Undo button is on the Moves tile.</span>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2 pr-6">
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[13px] font-bold text-white">That's solo</p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Head to <strong className="text-indigo-300">2P Battle</strong> for
              pass-and-play, smart AI bots, or Online play — create a room and share its
              link. Have fun!
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((s) => (
              <span
                key={s}
                className={`w-1.5 h-1.5 rounded-full ${
                  s === step ? 'bg-indigo-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          {step < 2 ? (
            <button
              onClick={step === 0 && !hasMadeFirstMove ? onFinish : next}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow"
            >
              {step === 0 ? (hasMadeFirstMove ? 'Next' : 'Skip ahead') : 'Next'}
            </button>
          ) : (
            <button
              onClick={onFinish}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow"
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
