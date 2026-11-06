import React from 'react';
import { Trophy, Lightbulb, Star, Undo2 } from 'lucide-react';
import { SoloGameState } from '../types';
import { type SoloStars, rateSoloStars } from '../utils/soloBalance';

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
}

export const SoloScoreboard: React.FC<SoloScoreboardProps> = ({
  gameState,
  currentHighScore,
  onGetHint,
  hint,
  hintsLeft,
  colorCount,
  onUndo,
  canUndo = false,
}) => {
  const isLossRisk =
    gameState.moves >= gameState.maxMoves - 3 && gameState.status === 'playing';
  const hintsExhausted = hintsLeft <= 0;

  // Stars are only meaningful once the board is solved.
  const stars: SoloStars | null =
    gameState.status === 'won'
      ? rateSoloStars(gameState.moves, gameState.grid.length, colorCount)
      : null;

  return (
    <div className="w-full grid grid-cols-3 gap-3 sm:gap-4 mb-6">
      {/* Moves Count */}
      <div className="bg-slate-850/60 border border-slate-700/40 rounded-2xl p-3 sm:p-4 text-center shadow-lg">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
          Moves
        </p>
        <p
          className={`text-xl sm:text-2xl font-mono font-black ${
            isLossRisk ? 'text-rose-400 animate-pulse' : 'text-indigo-400'
          }`}
        >
          {gameState.moves}
          <span className="text-slate-500 text-sm sm:text-lg font-normal">
            /{gameState.maxMoves}
          </span>
        </p>
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo last move (U)"
            title="Undo last move (U)"
            className="mt-1 mx-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-indigo-300 hover:bg-indigo-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </button>
        )}
      </div>

      {/* Best Score */}
      <div className="bg-slate-850/60 border border-slate-700/40 rounded-2xl p-3 sm:p-4 text-center shadow-lg">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
          Best Score
        </p>
        <div className="flex items-center justify-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-400" />
          <p className="text-xl sm:text-2xl font-mono font-black text-amber-400">
            {currentHighScore || '--'}
          </p>
        </div>
        {stars !== null && (
          <div
            className="flex items-center justify-center gap-0.5 mt-1"
            aria-label={`${stars} of 3 stars`}
          >
            {[1, 2, 3].map((n) => (
              <Star
                key={n}
                className={`w-3.5 h-3.5 ${
                  n <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-500'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hint Button (limited per game) */}
      <button
        onClick={onGetHint}
        disabled={gameState.status !== 'playing' || hintsExhausted}
        aria-label={`Smart hint, ${hintsLeft} left`}
        className={`bg-slate-850/60 border rounded-2xl p-3 sm:p-4 text-center transition-all group disabled:opacity-40 disabled:cursor-not-allowed shadow-lg ${
          hint !== null
            ? 'border-indigo-400/80 bg-indigo-950/30'
            : 'border-slate-700/40 hover:border-indigo-500/50 hover:bg-slate-800/80'
        }`}
      >
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-400 transition-colors">
          Smart Hint
        </p>
        <div className="flex items-center justify-center gap-1.5">
          <Lightbulb
            className={`w-5 h-5 transition-transform group-hover:scale-110 ${
              hint !== null ? 'text-amber-400 animate-bounce' : 'text-indigo-400'
            }`}
          />
          <span
            className={`text-xs font-mono font-bold ${
              hintsExhausted ? 'text-slate-500' : 'text-indigo-300'
            }`}
          >
            {hintsLeft}
          </span>
        </div>
      </button>
    </div>
  );
};
