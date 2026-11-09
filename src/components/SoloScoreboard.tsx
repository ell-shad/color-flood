import React from 'react';
import { Trophy, Lightbulb, Star, Undo2, Flame } from 'lucide-react';
import { SoloGameState, BoardShape } from '../types';
import { assertNever } from '../utils/boardShape';
import { type SoloStars, rateSoloStars } from '../utils/soloBalance';
import { rateWheelStars } from '../utils/circleEngine';
import { rateCubeStars } from '../utils/cubeEngine';

interface SoloScoreboardProps {
  gameState: SoloGameState;
  currentHighScore: number | null;
  onGetHint: () => void;
  hint: number | null;
  hintsLeft: number;
  colorCount: number;
  /** P5.2/P5.6: one-step undo (U key too). Absent = hidden (no online). */
  onUndo?: () => void;
  canUndo?: boolean;
  /** P7: board topology routes the star rating to the matching par table. */
  shape?: BoardShape;
  /** Ladder size (10–18) for the rating lookup — the wheel's grid is rings. */
  boardSize?: number;
  /** P6.1: daily challenge hub entry (was a separate centred strip). */
  onOpenDaily?: () => void;
  dailyStreak?: number;
}

/**
 * Solo HUD as one compact strip.
 *
 * The old three-card row ate ~100px of a 844px phone and, combined with the
 * stretched `justify-between` column, left a big dead band above the board.
 * Everything it showed is still here: moves + budget, best score and stars,
 * the limited hint counter, undo and the daily-challenge entry.
 */
export const SoloScoreboard: React.FC<SoloScoreboardProps> = ({
  gameState,
  currentHighScore,
  onGetHint,
  hint,
  hintsLeft,
  colorCount,
  onUndo,
  canUndo = false,
  shape = 'classic' as BoardShape,
  boardSize,
  onOpenDaily,
  dailyStreak = 0,
}) => {
  const isLossRisk =
    gameState.moves >= gameState.maxMoves - 3 && gameState.status === 'playing';
  const hintsExhausted = hintsLeft <= 0;

  // Stars are only meaningful once the board is solved; the rating size is
  // the ladder size (10–18), never the wheel's ring count.
  const ratingSize = boardSize ?? gameState.grid.length;
  let stars: SoloStars | null = null;
  if (gameState.status === 'won') {
    switch (shape) {
      case 'wheel':
        stars = rateWheelStars(gameState.moves, ratingSize, colorCount);
        break;
      case 'cube':
        stars = rateCubeStars(gameState.moves, ratingSize, colorCount);
        break;
      case 'classic':
        stars = rateSoloStars(gameState.moves, ratingSize, colorCount);
        break;
      default:
        assertNever(shape);
        break;
    }
  }

  const usedPercent = Math.min(100, (gameState.moves / gameState.maxMoves) * 100);

  return (
    <div className="w-full flex items-center gap-1.5 sm:gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/80 px-2 py-1.5 sm:px-2.5 shadow-lg select-none">
      {/* Moves + budget meter */}
      <div className="flex flex-col shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5">
          Moves
        </span>
        <span
          className={`font-mono font-black text-lg leading-none ${
            isLossRisk ? 'text-rose-400 animate-pulse' : 'text-indigo-300'
          }`}
        >
          {gameState.moves}
          <span className="text-slate-500 text-[11px] font-medium">
            /{gameState.maxMoves}
          </span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Moves used"
        aria-valuemin={0}
        aria-valuemax={gameState.maxMoves}
        aria-valuenow={gameState.moves}
        className="flex-1 min-w-[24px] h-1.5 rounded-full bg-slate-800 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isLossRisk ? 'bg-rose-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>

      {/* Best score (+ stars once solved) */}
      <div
        className="flex items-center gap-1 shrink-0"
        title="Best score"
        aria-label={`Best score: ${currentHighScore ?? 'none yet'}`}
      >
        <Trophy className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
        <span className="font-mono font-black text-sm text-amber-300">
          {currentHighScore || '--'}
        </span>
        {stars !== null && (
          <div
            role="img"
            className="flex items-center gap-0.5"
            aria-label={`${stars} of 3 stars`}
          >
            {[1, 2, 3].map((n) => (
              <Star
                key={n}
                className={`w-2.5 h-2.5 ${
                  n <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Limited hint */}
      <button
        onClick={onGetHint}
        disabled={gameState.status !== 'playing' || hintsExhausted}
        aria-label={`Smart hint, ${hintsLeft} left`}
        title="Smart hint"
        className={`shrink-0 flex items-center gap-1 rounded-lg border px-1.5 py-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          hint !== null
            ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
            : 'border-slate-700/70 bg-slate-800/70 text-slate-300 hover:border-indigo-500/60 hover:text-white'
        }`}
      >
        <Lightbulb
          className={`w-3.5 h-3.5 ${
            hint !== null ? 'text-amber-400 animate-bounce' : 'text-indigo-300'
          }`}
          aria-hidden="true"
        />
        <span
          className={`font-mono text-xs font-bold ${
            hintsExhausted ? 'text-slate-500' : ''
          }`}
        >
          {hintsLeft}
        </span>
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Hint
        </span>
      </button>

      {onUndo && (
        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last move (U)"
          title="Undo last move (U)"
          className="shrink-0 p-1.5 rounded-lg border border-slate-700/70 bg-slate-800/70 text-slate-300 transition-colors hover:text-indigo-300 hover:border-indigo-500/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {onOpenDaily && (
        <button
          onClick={onOpenDaily}
          aria-label="Open the Daily Challenge hub"
          title="Daily Challenge"
          className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-800/70 px-1.5 py-1 text-slate-300 transition-colors hover:text-amber-200 hover:border-amber-500/50 cursor-pointer"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
            {dailyStreak}
          </span>
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Daily
          </span>
        </button>
      )}
    </div>
  );
};
