import React, { useMemo } from 'react';
import { GameMode, MultiplayerOpponent, GameTheme } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';

/**
 * P4.6: board rendering used to run one framer-motion element per cell (up to
 * 324 animation loops on 18x18). Cells are now plain `React.memo` divs:
 *  - color updates ride CSS `transition: background-color` with the same 0.26 s
 *    ease-out and the wave stagger from the pre-refactor version;
 *  - the scale pop is named per palette index (`cell-pop-0..7`), so the
 *    animation restarts exactly when a cell's color changes; untouched cells
 *    keep their settled animation and are skipped by the memo (P8: the old
 *    even/odd name swap replayed the pop on every cell of the board on every
 *    move — up to 324 animations per tap).
 */

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
  /** P5.4: overlay digit (palette index + 1) on every cell — color-blind aid. */
  showColorSymbols?: boolean;
  /** Measured square edge from useBoardFit — the board fills its box. */
  boardPx?: number;
}

interface GridCellProps {
  color: string;
  radiusClass: string;
  glowClass: string;
  /** Which start-corner halo to render, if any. */
  startMarker: 'none' | 'p1' | 'p2';
  p2Label: string;
  showOverlay: boolean;
  ownedMarker: 'none' | 'p1' | 'p2';
  waveDelay: number;
  /**
   * Palette index — the pop keyframe is named per color, so the animation
   * restarts when (and only when) this cell's color changes.
   */
  colorIndex: number;
  /** P5.4: digit glyph ('' = hidden) with AA ink colors for this cell. */
  symbolGlyph: string;
  inkColor: string;
  inkShadow: string;
}

/**
 * P4.6: memoized cell — per-cell framer-motion loops replaced by a plain
 * div. Following the original animation schedule:
 *   backgroundColor 0.26s ease-out + wave delay, scale pop 0.32s ease-in-out.
 */
const GridCell = React.memo(function GridCell({
  color,
  radiusClass,
  glowClass,
  startMarker,
  p2Label,
  showOverlay,
  ownedMarker,
  waveDelay,
  colorIndex,
  symbolGlyph,
  inkColor,
  inkShadow,
}: GridCellProps) {
  return (
    <div
      className={`relative ${radiusClass} shadow-inner flex items-center justify-center ${glowClass}`}
      style={{
        backgroundColor: color,
        transition: 'background-color 0.26s ease-out',
        transitionDelay: `${waveDelay}s`,
        // `backwards` not `both`: the finished pop is dropped instead of kept
        // alive on the element, so a settled board holds no animations at all.
        animation: `cell-pop-${colorIndex} 0.32s ease-in-out ${waveDelay}s backwards`,
      }}
    >
      {/* P5.4: palette-index digit (1–8) — tells a color-blind player exactly
          which palette button to press; ink is contrast-checked per cell. */}
      {symbolGlyph && (
        <span
          className="pointer-events-none select-none font-black leading-none text-[11px] sm:text-[13px]"
          style={{ color: inkColor, textShadow: inkShadow }}
        >
          {symbolGlyph}
        </span>
      )}
      {/* Starting Root Corner Animated Halo — visuals unchanged */}
      {startMarker === 'p1' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="relative flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded bg-cyan-400 opacity-40" />
            <span className="relative bg-slate-950/90 text-cyan-300 text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded border border-cyan-400/70 shadow">
              P1
            </span>
          </span>
        </div>
      )}
      {startMarker === 'p2' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="relative flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded bg-rose-400 opacity-40" />
            <span className="relative bg-slate-950/90 text-rose-300 text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded border border-rose-400/70 shadow">
              {p2Label}
            </span>
          </span>
        </div>
      )}

      {/* Subtle Territory Markers on Owned Cells */}
      {showOverlay && startMarker === 'none' && ownedMarker === 'p1' && (
        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-cyan-100/90 shadow-sm pointer-events-none" />
      )}
      {showOverlay && startMarker === 'none' && ownedMarker === 'p2' && (
        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-rose-100/90 shadow-sm pointer-events-none" />
      )}
    </div>
  );
});

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
  showColorSymbols = false,
  boardPx,
}) => {
  const p1Set = useMemo(() => new Set(p1Cells), [p1Cells]);
  const p2Set = useMemo(() => new Set(p2Cells), [p2Cells]);

  const activeColors = theme.colors;
  const glowP1 = theme.glowP1;
  const glowP2 = theme.glowP2;
  const radius = theme.cellRadius;
  const p2Label = opponent === 'bot' ? 'BOT' : 'P2';

  return (
    <div
      className={`relative ${theme.boardBg} p-1.5 sm:p-2.5 rounded-2xl border ${theme.boardBorder} shadow-2xl overflow-hidden select-none mx-auto shrink-0 transition-colors duration-300`}
      style={{
        width: boardPx ? `${boardPx}px` : 'min(88vw, min(40vh, 380px))',
        height: boardPx ? `${boardPx}px` : undefined,
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

            // Distance from the active root: same wave stagger as before.
            const distFromP1 = r + c;
            const distFromP2 = gridSize - 1 - r + (gridSize - 1 - c);
            const waveDist = lastMovingPlayer === 2 ? distFromP2 : distFromP1;
            const waveDelay = Math.min(0.24, waveDist * 0.014);

            let glowClass = '';
            if (showTerritoryOverlay && isP1Owned) glowClass = glowP1;
            else if (showTerritoryOverlay && isP2Owned) glowClass = glowP2;

            let ownedMarker: 'none' | 'p1' | 'p2' = 'none';
            if (isP1Owned) ownedMarker = 'p1';
            else if (isP2Owned) ownedMarker = 'p2';

            // P5.4: pick ink ≥ 4.5:1 on this cell's fill for the digit overlay.
            const cellHex = activeColors[colorIdx] || '#FF595E';
            const ink = showColorSymbols ? cellInkOn(cellHex) : null;

            return (
              <GridCell
                key={key}
                color={cellHex}
                radiusClass={radius}
                glowClass={glowClass}
                startMarker={isP1Start ? 'p1' : isP2Start ? 'p2' : 'none'}
                p2Label={p2Label}
                showOverlay={showTerritoryOverlay}
                ownedMarker={ownedMarker}
                waveDelay={waveDelay}
                colorIndex={colorIdx}
                symbolGlyph={ink ? String(colorIdx + 1) : ''}
                inkColor={ink ? ink.color : ''}
                inkShadow={ink ? ink.shadow : ''}
              />
            );
          }),
        )}
      </div>
    </div>
  );
};
