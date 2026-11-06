import React from 'react';
import { motion } from 'motion/react';
import { GameMode, MultiplayerOpponent, PlayerId, GameTheme } from '../types';
import { THEMES } from '../utils/themes';

interface ColorPaletteProps {
  colorCount: number;
  mode: GameMode;
  onSelectColor: (colorIndex: number) => void;
  disabled: boolean;
  hint: number | null;
  hintGain?: number;
  soloCurrentColor?: number;
  p1Color?: number;
  p2Color?: number;
  activeTurn?: PlayerId;
  opponent?: MultiplayerOpponent;
  theme?: GameTheme;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  colorCount,
  mode,
  onSelectColor,
  disabled,
  hint,
  hintGain,
  soloCurrentColor,
  p1Color,
  p2Color,
  activeTurn,
  opponent,
  theme = THEMES.arcade,
}) => {
  const activeColors = theme.colors.slice(0, colorCount);
  const activeNames = theme.colorNames;

  return (
    <div className="w-full max-w-lg mx-auto mt-2 sm:mt-3 px-1 select-none">
      {/* Helper text for 2-player mode */}
      {mode === 'multiplayer' && !disabled && (
        <div className="text-center mb-1.5 sm:mb-2">
          <p className="text-[11px] text-slate-400">
            {activeTurn === 1 ? (
              <span className="text-cyan-400 font-bold">Player 1</span>
            ) : (
              <span className="text-rose-400 font-bold">
                {opponent === 'bot' ? 'AI Bot' : 'Player 2'}
              </span>
            )}
            : Pick neutral color to expand territory
          </p>
        </div>
      )}

      {/* Button Row / Grid: Auto-scales cleanly for 4, 5, 6, 7, 8 colors */}
      <div className="flex justify-center items-center gap-1.5 sm:gap-2.5 flex-wrap">
        {activeColors.map((color, idx) => {
          let isColorDisabled = disabled;
          let badgeLabel: string | null = null;
          let badgeClass = '';

          if (mode === 'solo') {
            if (idx === soloCurrentColor) {
              isColorDisabled = true;
              badgeLabel = 'Current';
              badgeClass = 'bg-slate-900/95 text-slate-300';
            }
          } else {
            // Multiplayer occupied colors
            if (idx === p1Color) {
              isColorDisabled = true;
              badgeLabel = 'P1';
              // cyan-700: white text at 5.4:1 (cyan-600 was 3.7:1, AA fail).
              badgeClass = 'bg-cyan-700 text-white border border-cyan-400/40';
            } else if (idx === p2Color) {
              isColorDisabled = true;
              badgeLabel = opponent === 'bot' ? 'BOT' : 'P2';
              badgeClass = 'bg-rose-600 text-white border border-rose-400/40';
            }
          }

          const isHinted = hint === idx;

          return (
            <div key={idx} className="relative group">
              <motion.button
                whileHover={!isColorDisabled ? { scale: 1.08, y: -2 } : {}}
                whileTap={!isColorDisabled ? { scale: 0.92 } : {}}
                onClick={() => !isColorDisabled && onSelectColor(idx)}
                disabled={isColorDisabled}
                className={`w-10 h-10 sm:w-12 sm:h-12 min-w-[38px] min-h-[38px] rounded-xl sm:rounded-2xl shadow-md transition-all relative cursor-pointer disabled:cursor-not-allowed ${
                  isColorDisabled
                    ? 'opacity-35 grayscale-[0.5] scale-95 shadow-none'
                    : 'hover:shadow-indigo-500/20 active:scale-95'
                } ${
                  isHinted
                    ? 'ring-3 ring-amber-400 ring-offset-2 ring-offset-[#0F172A] scale-105'
                    : ''
                }`}
                style={{ backgroundColor: color }}
                title={`${activeNames[idx] || `Color ${idx + 1}`}${
                  badgeLabel ? ` (${badgeLabel})` : ''
                }`}
                aria-label={`${activeNames[idx]}${badgeLabel ? ` - ${badgeLabel}` : ''}`}
              >
                {/* Overlay badge for owned color */}
                {badgeLabel && (
                  <span
                    className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-black px-1 py-0.2 rounded shadow tracking-wider whitespace-nowrap ${badgeClass}`}
                  >
                    {badgeLabel}
                  </span>
                )}
              </motion.button>

              {/* Best Hint Bubble */}
              {isHinted && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                >
                  <div className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded shadow-lg whitespace-nowrap uppercase tracking-wider flex items-center gap-1">
                    <span>Best</span>
                    {typeof hintGain === 'number' && hintGain > 0 && (
                      <span className="font-mono">(+{hintGain})</span>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
