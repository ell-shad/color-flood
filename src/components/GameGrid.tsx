import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { GameMode, MultiplayerOpponent, GameTheme } from '../types';
import { THEMES } from '../utils/themes';

interface GameGridProps {
  grid: number[][];
  gridSize: number;
  mode: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
  activeTurn?: 1 | 2;
  lastMovingPlayer?: 1 | 2;
  theme?: GameTheme;
}

export const GameGrid: React.FC<GameGridProps> = ({
  grid,
  gridSize,
  mode,
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  lastMovingPlayer = 1,
  theme = THEMES.arcade,
}) => {
  const p1Set = useMemo(() => new Set(p1Cells), [p1Cells]);
  const p2Set = useMemo(() => new Set(p2Cells), [p2Cells]);

  const activeColors = theme.colors;

  return (
    <div
      className={`relative ${theme.boardBg} p-1.5 sm:p-2.5 rounded-2xl border ${theme.boardBorder} shadow-2xl overflow-hidden select-none mx-auto shrink-0 transition-colors duration-300`}
      style={{
        width: 'min(88vw, min(40vh, 380px))',
        aspectRatio: '1/1',
      }}
    >
      <div
        className="grid gap-1 sm:gap-1.5 w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((row, r) =>
          row.map((colorIdx, c) => {
            const key = `${r},${c}`;
            const isP1Start = mode === 'multiplayer' && r === 0 && c === 0;
            const isP2Start =
              mode === 'multiplayer' && r === gridSize - 1 && c === gridSize - 1;

            const isP1Owned = mode === 'multiplayer' && p1Set.has(key);
            const isP2Owned = mode === 'multiplayer' && p2Set.has(key);

            // Compute distance from active root for fluid wave animation
            const distFromP1 = r + c;
            const distFromP2 = gridSize - 1 - r + (gridSize - 1 - c);
            const waveDist = lastMovingPlayer === 2 ? distFromP2 : distFromP1;
            const waveDelay = Math.min(0.24, waveDist * 0.014);

            const cellColor = activeColors[colorIdx] || '#FF595E';

            return (
              <motion.div
                key={key}
                initial={false}
                animate={{
                  backgroundColor: cellColor,
                  scale: [1, 1.1, 0.98, 1],
                }}
                transition={{
                  backgroundColor: { duration: 0.26, ease: 'easeOut', delay: waveDelay },
                  scale: { duration: 0.32, ease: 'easeInOut', delay: waveDelay },
                }}
                className={`relative ${theme.cellRadius} shadow-inner flex items-center justify-center transition-shadow ${
                  showTerritoryOverlay && isP1Owned ? theme.glowP1 : ''
                } ${showTerritoryOverlay && isP2Owned ? theme.glowP2 : ''}`}
              >
                {/* Starting Root Corner 1 with Animated Halo */}
                {isP1Start && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <span className="relative flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded bg-cyan-400 opacity-40" />
                      <span className="relative bg-slate-950/90 text-cyan-300 text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded border border-cyan-400/70 shadow">
                        P1
                      </span>
                    </span>
                  </div>
                )}

                {/* Starting Root Corner 2 with Animated Halo */}
                {isP2Start && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <span className="relative flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded bg-rose-400 opacity-40" />
                      <span className="relative bg-slate-950/90 text-rose-300 text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded border border-rose-400/70 shadow">
                        {opponent === 'bot' ? 'BOT' : 'P2'}
                      </span>
                    </span>
                  </div>
                )}

                {/* Subtle Territory Markers on Owned Cells */}
                {showTerritoryOverlay &&
                  mode === 'multiplayer' &&
                  !isP1Start &&
                  !isP2Start && (
                    <>
                      {isP1Owned && (
                        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-cyan-100/90 shadow-sm pointer-events-none" />
                      )}
                      {isP2Owned && (
                        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-rose-100/90 shadow-sm pointer-events-none" />
                      )}
                    </>
                  )}
              </motion.div>
            );
          }),
        )}
      </div>
    </div>
  );
};
