import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  BarChart3,
  Trophy,
  Flame,
  CalendarDays,
  Star,
  Trash2,
  ShieldCheck,
  Circle,
  Square,
  Box,
  Hexagon,
} from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import {
  type SoloStats,
  statsStarsFor,
  winRatePercent,
  avgMovesFor,
} from '../utils/soloStats';
import { type DailyStreak } from '../utils/daily';
import { isCube, isMosaic, isWheel } from '../utils/boardShape';
import { type SoloStars } from '../utils/soloBalance';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soloStats: SoloStats;
  /** Daily puzzle streak display (from the daily-streak store). */
  dailyStreak: DailyStreak;
  /** Clears all recorded solo stats after an in-place confirm. */
  onReset: () => void;
}

const StarRow = ({ stars }: { stars: SoloStars }) => (
  <span className="inline-flex items-center gap-0.5" aria-hidden="true">
    {[1, 2, 3].map((n) => (
      <Star
        key={n}
        className={`w-3 h-3 ${n <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`}
      />
    ))}
  </span>
);

const Tile = ({
  icon,
  value,
  label,
  sub,
  iconClass,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  sub?: string;
  iconClass: string;
}) => (
  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
    <div
      className={`flex items-center justify-center gap-1.5 ${iconClass}`}
      aria-hidden="true"
    >
      {icon}
      <span className="text-xl font-black text-white">{value}</span>
    </div>
    <p className="text-[11px] font-bold text-slate-300 mt-0.5">{label}</p>
    {sub !== undefined && (
      <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{sub}</p>
    )}
  </div>
);

/**
 * P6.2: per-device solo statistics — completion totals, win rate, win
 * streak, the daily-challenge streak, and a per-config breakdown
 * (games / win rate / avg + best moves / star record of the best win).
 */
export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  soloStats,
  dailyStreak,
  onReset,
}) => {
  // P5.3: dialog semantics, focus trap, focus restore.
  const panelRef = useModalA11y(isOpen);

  const [armReset, setArmReset] = useState(false);

  const winRate = winRatePercent(soloStats.total.wins, soloStats.total.games);
  const hasGames = soloStats.total.games > 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Statistics"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Your Stats</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2">
            <Tile
              icon={<BarChart3 className="w-4 h-4" />}
              value={soloStats.total.games}
              label="Games played"
              sub={`${soloStats.total.wins} ${soloStats.total.wins === 1 ? 'win' : 'wins'}`}
              iconClass="text-indigo-400"
            />
            <Tile
              icon={<Trophy className="w-4 h-4" />}
              value={hasGames ? `${winRate}%` : '—'}
              label="Win rate"
              iconClass="text-emerald-400"
            />
            <Tile
              icon={<Flame className="w-4 h-4" />}
              value={soloStats.winStreak.current}
              label="Win streak"
              sub={`best ${soloStats.winStreak.best}`}
              iconClass="text-amber-400"
            />
            <Tile
              icon={<CalendarDays className="w-4 h-4" />}
              value={dailyStreak.current}
              label="Daily streak"
              sub={`best ${dailyStreak.best}`}
              iconClass="text-cyan-400"
            />
          </div>

          {/* Per-config breakdown */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              By board config
            </h3>
            {!hasGames || soloStats.byConfig.length === 0 ? (
              <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4 text-center text-xs text-slate-300">
                No completed games yet — win or lose a solo board and it will show up
                here.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                      <th scope="col" className="py-1.5 px-2 text-left">
                        Config
                      </th>
                      <th scope="col" className="py-1.5 px-1 text-right">
                        Games
                      </th>
                      <th scope="col" className="py-1.5 px-1 text-right">
                        Win%
                      </th>
                      <th scope="col" className="py-1.5 px-1 text-right">
                        Avg
                      </th>
                      <th scope="col" className="py-1.5 px-1 text-right">
                        Best
                      </th>
                      <th scope="col" className="py-1.5 px-2 text-right">
                        Stars
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {soloStats.byConfig.map((entry) => {
                      const stars = statsStarsFor(entry);
                      return (
                        <tr
                          key={`${entry.shape}-${entry.size}-${entry.colors}`}
                          className="border-t border-slate-800 text-slate-200"
                        >
                          <td className="py-1.5 px-2 text-left font-mono font-bold text-indigo-300">
                            {/* P7.3: rows are keyed by topology (classic ⊞ / wheel ◉) */}
                            <span className="inline-flex items-center gap-1">
                              {isMosaic(entry.shape) ? (
                                <Hexagon
                                  className="w-3 h-3 text-amber-300 shrink-0"
                                  aria-hidden="true"
                                />
                              ) : isCube(entry.shape) ? (
                                <Box
                                  className="w-3 h-3 text-emerald-300 shrink-0"
                                  aria-hidden="true"
                                />
                              ) : isWheel(entry.shape) ? (
                                <Circle
                                  className="w-3 h-3 text-fuchsia-300 shrink-0"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Square
                                  className="w-3 h-3 text-indigo-300 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              <span>
                                {entry.size}
                                {isWheel(entry.shape) ||
                                isCube(entry.shape) ||
                                isMosaic(entry.shape)
                                  ? ''
                                  : '²'}
                                ·{entry.colors}
                              </span>
                              <span className="sr-only">
                                {isMosaic(entry.shape)
                                  ? 'mosaic board'
                                  : isWheel(entry.shape)
                                    ? 'wheel board'
                                    : isCube(entry.shape)
                                      ? 'cube board'
                                      : 'classic board'}
                              </span>
                            </span>
                          </td>
                          <td className="py-1.5 px-1 text-right">
                            {entry.games}
                            <span className="text-slate-400">/</span>
                            {entry.wins}
                          </td>
                          <td className="py-1.5 px-1 text-right font-bold">
                            {winRatePercent(entry.wins, entry.games)}%
                          </td>
                          <td className="py-1.5 px-1 text-right text-slate-300">
                            {avgMovesFor(entry) === null
                              ? '—'
                              : avgMovesFor(entry)!.toFixed(1)}
                          </td>
                          <td className="py-1.5 px-1 text-right text-emerald-300 font-bold">
                            {entry.bestMoves ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {stars === null ? (
                              <span className="text-slate-400" aria-hidden="true">
                                —
                              </span>
                            ) : (
                              <span role="img" aria-label={`${stars} of 3 stars`}>
                                <StarRow stars={stars} />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reset (two-tap arm) */}
          <div className="pt-1 border-t border-slate-750 flex justify-center">
            {armReset ? (
              <button
                onClick={() => {
                  onReset();
                  setArmReset(false);
                }}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tap again to erase all stats</span>
              </button>
            ) : (
              <button
                onClick={() => setArmReset(true)}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear stats</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
