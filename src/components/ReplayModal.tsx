import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
} from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import { reconstructReplayStates } from '../utils/replay';
import { WheelBoard } from './WheelBoard';
import type { SoloMoveDiff, GameTheme, BoardShape } from '../types';

interface ReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Final board of the finished game. */
  grid: number[][];
  /** Per-move repaint diffs (P5.6 format); index 0 = initial board. */
  history: SoloMoveDiff[][];
  /** Played palette indices (1-based) for the move label chip. */
  playedColors: number[];
  theme: GameTheme;
  /** P7.3: board topology — wheels replay on the polar board. */
  shape?: BoardShape;
  /** P7.3: ladder size (10–18) the wheel geometry derives from. */
  size?: number;
  /** Auto-advance cadence for the play button (ms). */
  stepMs?: number;
}

/**
 * P6.3: pure replay viewer for finished solo games. It renders local copies
 * of each board state (backward-built from the final grid + diffs); no game
 * state is touched, so pausing/stepping can never corrupt the real round.
 */
export const ReplayModal: React.FC<ReplayModalProps> = ({
  isOpen,
  onClose,
  grid,
  history,
  playedColors,
  theme,
  shape = 'classic',
  size = 10,
  stepMs = 700,
}) => {
  // P5.3: dialog semantics, focus trap, focus restore.
  const panelRef = useModalA11y(isOpen);

  const states = useMemo(() => reconstructReplayStates(grid, history), [grid, history]);
  const last = states.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Reset the transport back to the opening board whenever the viewer opens
  // (React's documented render-phase state adjustment; no reset effect).
  const [snapshotOpen, setSnapshotOpen] = useState(isOpen);
  if (isOpen !== snapshotOpen) {
    setSnapshotOpen(isOpen);
    if (isOpen) {
      setIndex(0);
      setPlaying(false);
    }
  }

  // Auto-advance while playing. The final stop happens inside the interval
  // callback (async context), never synchronously in this effect.
  useEffect(() => {
    if (!playing || !isOpen || index >= last) return;
    const t = setInterval(() => {
      setIndex((i) => {
        if (i >= last) {
          clearInterval(t);
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, stepMs);
    return () => clearInterval(t);
  }, [playing, isOpen, index, last, stepMs]);

  if (!isOpen) return null;

  const replayGrid = states[Math.min(index, last)] ?? grid;
  // playedColors are 0-based palette indices (solo machine recording).
  const moveChip = index > 0 ? playedColors[index - 1] : null;
  const chipBg =
    moveChip !== undefined && moveChip !== null
      ? theme.colors[moveChip % theme.colors.length]
      : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Game replay"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Game Replay</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Board frame — P7.3: wheels replay on the polar board */}
          <div className="flex justify-center">
            {shape === 'wheel' ? (
              <WheelBoard
                grid={replayGrid}
                size={size}
                theme={theme}
                frameWidth="min(100%, 300px)"
              />
            ) : (
              <div
                className={`relative ${theme.boardBg} p-1.5 sm:p-2.5 rounded-2xl border ${theme.boardBorder} shadow-2xl overflow-hidden select-none`}
                style={{ width: 'min(60vw, min(34vh, 300px))', aspectRatio: '1/1' }}
              >
                <div
                  className="grid gap-1 sm:gap-1.5 w-full h-full"
                  style={{
                    gridTemplateColumns: `repeat(${replayGrid.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${replayGrid.length}, minmax(0, 1fr))`,
                  }}
                >
                  {replayGrid.map((row, r) =>
                    row.map((colorIdx, c) => (
                      <div
                        key={`${r},${c}`}
                        className="rounded-[6px] sm:rounded-md shadow-inner transition-colors duration-300"
                        style={{ backgroundColor: theme.colors[colorIdx] }}
                      />
                    )),
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Progress + played-color chip */}
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-slate-300 tabular-nums">
              {index === 0 ? 'Opening board' : `Move ${index} of ${last}`}
            </p>
            {moveChip !== null && chipBg && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-slate-300">
                <span
                  className="w-3.5 h-3.5 rounded-md border border-slate-600 inline-block"
                  style={{ backgroundColor: chipBg }}
                  aria-hidden="true"
                />
                <span>Palette {moveChip + 1}</span>
              </p>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Back to opening board"
              title="Opening board"
              disabled={index === 0 && !playing}
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous move"
              title="Previous move"
              disabled={index === 0 && !playing}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className={`p-2.5 rounded-xl w-11 h-11 flex items-center justify-center font-bold transition-all cursor-pointer text-sm ${
                playing
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Pause className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.min(last, i + 1));
              }}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next move"
              title="Next move"
              disabled={index >= last}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setIndex(last);
              }}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Jump to final board"
              title="Final board"
              disabled={index >= last}
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <p className="flex items-center justify-center gap-1 text-[11px] text-slate-400 text-center">
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Step through every move of the finished game.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
