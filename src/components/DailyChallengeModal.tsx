import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CalendarDays, Flame, Copy, Check, Play, Expand, Trophy } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import {
  dailyDateString,
  dailyPuzzleNumber,
  dailySetupFor,
  type DailyStreak,
} from '../utils/daily';

interface DailyChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Date of the round currently active in the solo machine (null = none). */
  dailyDate: string | null;
  /** Non-null only when that active round has finished (won or lost). */
  dailyShareText: string | null;
  /** Per-device streak state from versioned storage. */
  dailyStreak: DailyStreak;
  /** Starts (or restarts) today's date-seeded board. */
  onStartDaily: () => void;
}

/**
 * P6.1: Daily Challenge hub — today's puzzle number/config, the per-device
 * streak, and a Wordle-style share sheet once the round is finished.
 */
export const DailyChallengeModal: React.FC<DailyChallengeModalProps> = ({
  isOpen,
  onClose,
  dailyDate,
  dailyShareText,
  dailyStreak,
  onStartDaily,
}) => {
  // P5.3: dialog semantics, focus trap, focus restore.
  const panelRef = useModalA11y(isOpen);

  const today = dailyDateString();
  const todaySetup = dailySetupFor(today);
  const finishedToday = dailyDate === today && dailyShareText !== null;
  const roundRunning = dailyDate === today && !finishedToday;

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const handleCopy = async () => {
    if (!dailyShareText) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(dailyShareText);
    } catch {
      // Clipboard API needs a focused document; fall back to execCommand.
      const ta = document.createElement('textarea');
      ta.value = dailyShareText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let fallbackOk = false;
      try {
        fallbackOk = document.execCommand('copy');
      } catch {
        fallbackOk = false;
      }
      ta.remove();
      if (!fallbackOk) {
        setCopyFailed(true);
        setTimeout(() => setCopyFailed(false), 2000);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Daily challenge"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Daily Challenge</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Puzzle identity */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <CalendarDays className="w-4 h-4 text-indigo-400" aria-hidden="true" />
              <span>
                Puzzle #{dailyPuzzleNumber(today)}
              </span>
              <span className="text-slate-400 font-medium">· {today}</span>
            </div>
            <p className="text-xs text-slate-300">
              One seeded board for everyone today:{' '}
              <span className="font-mono font-bold text-indigo-300">
                {todaySetup.size}²·{todaySetup.colors}
              </span>{' '}
              colors. New puzzle every midnight.
            </p>
          </div>

          {/* Streak flames */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-amber-400" aria-hidden="true">
                <Flame className="w-4 h-4" />
                <span className="text-xl font-black text-white">{dailyStreak.current}</span>
              </div>
              <p className="text-[11px] font-bold text-slate-300 mt-0.5">Current streak</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-300" aria-hidden="true">
                <Trophy className="w-4 h-4" />
                <span className="text-xl font-black text-white">{dailyStreak.best}</span>
              </div>
              <p className="text-[11px] font-bold text-slate-300 mt-0.5">Best streak</p>
            </div>
          </div>

          {/* State-dependent action area */}
          {finishedToday ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-950/40 border border-emerald-700/50 p-3 text-center">
                <p className="text-sm font-bold text-emerald-300">
                  You're done with today's puzzle!
                </p>
                <p className="text-[11px] text-slate-300 mt-1">
                  Come back tomorrow for a fresh board.
                </p>
              </div>
              <button
                onClick={handleCopy}
                className={`w-full py-2.5 px-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm ${
                  copied
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/25'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : copyFailed ? (
                  <>
                    <X className="w-4 h-4" aria-hidden="true" />
                    <span>Copy failed — try again</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" aria-hidden="true" />
                    <span>Share result</span>
                  </>
                )}
              </button>
            </div>
          ) : roundRunning ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 text-center">
                Your round is on the board right now.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <Expand className="w-4 h-4" aria-hidden="true" />
                <span>Go to board</span>
              </button>
              <button
                onClick={onStartDaily}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restart today's round</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onStartDaily}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>
                {dailyDate === null || dailyDate < today ? "Play today's puzzle" : "Restart today's round"}
              </span>
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
