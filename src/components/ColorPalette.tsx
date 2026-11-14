import React from 'react';
import { BoardShape, GameMode, MultiplayerOpponent, PlayerId, GameTheme } from '../types';
import { THEMES } from '../utils/themes';
import { isFlatShape } from '../utils/boardShape';

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
  opponent?: MultiplayerOpponent;
  theme?: GameTheme;
  /** P11: 3D boards play colour-only, so emoji swatches are flat-board only. */
  boardShape?: BoardShape;
  /** P5.7: prominent turn chip — who moves (or who you wait for). */
  turnStatus?: { label: string; turn: PlayerId | null } | null;
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
  opponent,
  theme = THEMES.arcade,
  boardShape,
  turnStatus = null,
}) => {
  const activeColors = theme.colors.slice(0, colorCount);
  const activeNames = theme.colorNames;
  // The emoji skin is flat-board only; 3D boards keep plain colour swatches.
  const emoji = boardShape && !isFlatShape(boardShape) ? undefined : theme.emoji;

  return (
    <div className="w-full max-w-xl mx-auto mt-0 px-1 select-none">
      {/* P5.7: turn chip — a loud, always-on turn indicator during play.
          Waiting (online): whose move you are waiting for; your turn: a
          player-colored pill carrying the old helper copy as its subtitle. */}
      {mode === 'multiplayer' && turnStatus && (
        <div className="flex justify-center mb-1">
          <div
            className={`inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-lg border shadow-md ${
              turnStatus.turn === 1
                ? 'bg-cyan-950/40 border-cyan-500/50'
                : turnStatus.turn === 2
                  ? 'bg-rose-950/40 border-rose-500/50'
                  : 'bg-slate-800/70 border-slate-700/60'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                turnStatus.turn === 1
                  ? 'bg-cyan-400 animate-pulse'
                  : turnStatus.turn === 2
                    ? 'bg-rose-400 animate-pulse'
                    : 'bg-slate-500 animate-pulse'
              }`}
            />
            <span className="text-[11px] sm:text-sm font-bold text-slate-100 truncate">
              {turnStatus.label}
            </span>
            {turnStatus.turn !== null && (
              <span className="hidden sm:inline text-[10px] text-slate-400 whitespace-nowrap">
                — pick neutral to expand territory
              </span>
            )}
          </div>
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
              <button
                type="button"
                onClick={() => !isColorDisabled && onSelectColor(idx)}
                disabled={isColorDisabled}
                // Only transform/shadow animate: CSS compositor hover/tap keeps
                // motion/react out of the initial boot chunk.
                className={`w-10 h-10 sm:w-12 sm:h-12 min-w-[38px] min-h-[38px] rounded-xl sm:rounded-2xl shadow-md transition-[transform,box-shadow] duration-150 relative flex items-center justify-center cursor-pointer disabled:cursor-not-allowed ${
                  isColorDisabled
                    ? 'opacity-35 grayscale-[0.5] scale-95 shadow-none'
                    : 'hover:scale-105 hover:-translate-y-0.5 hover:shadow-indigo-500/20 active:scale-92'
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
                {/* Emoji themes put the picture right on the palette button. */}
                {emoji?.[idx] && (
                  <span
                    aria-hidden="true"
                    className="text-lg sm:text-2xl leading-none select-none drop-shadow-sm"
                  >
                    {emoji[idx]}
                  </span>
                )}

                {/* Overlay badge for owned color */}
                {badgeLabel && (
                  <span
                    className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-black px-1 py-0.2 rounded shadow tracking-wider whitespace-nowrap ${badgeClass}`}
                  >
                    {badgeLabel}
                  </span>
                )}
              </button>

              {/* Best Hint Bubble */}
              {isHinted && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-[pop-in_160ms_ease-out]">
                  <div className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded shadow-lg whitespace-nowrap uppercase tracking-wider flex items-center gap-1">
                    <span>Best</span>
                    {typeof hintGain === 'number' && hintGain > 0 && (
                      <span className="font-mono">(+{hintGain})</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
