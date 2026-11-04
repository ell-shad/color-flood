import React from 'react';
import { Trophy, Lightbulb } from 'lucide-react';
import { SoloGameState } from '../types';

interface SoloScoreboardProps {
  gameState: SoloGameState;
  currentHighScore: number | null;
  onGetHint: () => void;
  hint: number | null;
}

export const SoloScoreboard: React.FC<SoloScoreboardProps> = ({
  gameState,
  currentHighScore,
  onGetHint,
  hint,
}) => {
  const isLossRisk =
    gameState.moves >= gameState.maxMoves - 3 && gameState.status === 'playing';

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
      </div>

      {/* Hint Button */}
      <button
        onClick={onGetHint}
        disabled={gameState.status !== 'playing'}
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
        </div>
      </button>
    </div>
  );
};
