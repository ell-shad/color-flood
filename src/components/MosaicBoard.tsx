import React, { useMemo } from 'react';
import type { GameTheme } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';
import { GHOST_ALPHA } from './BoardCell';
import {
  mosaicDistanceField,
  mosaicLayout,
  mosaicSeedCell,
  type MosaicCell,
} from '../utils/mosaicEngine';

/**
 * P13: mosaic board — the Voronoi tiling from `mosaicEngine`, drawn as SVG
 * polygons.
 *
 * The polygons come from the same layout the flood walks, and they tile the
 * square exactly (each cell is the intersection of its own half-planes), so
 * the board needs no gaps, no depth sorting and no per-cell clipping. Cells
 * are stroked with a dark separator so every polygon edge stays legible.
 *
 * `grid[r][c]` is cell index `r * side + c` in lattice order (see the engine),
 * which keeps the solo reducer, undo diffs, records and share links unchanged.
 */

interface MosaicBoardProps {
  grid: number[][];
  /** Ladder size (10..18) — also the number of cells per row. */
  size: number;
  theme?: GameTheme;
  /** P5.4: overlay digit (palette index + 1) per cell — color-blind aid. */
  showColorSymbols?: boolean;
  /** P7.3: frame width override (the replay modal renders it smaller). */
  frameWidth?: string;
  /** Measured square edge from useBoardFit — the board fills its box. */
  boardPx?: number;
}

interface FacetProps {
  cell: MosaicCell;
  points: string;
  fontSize: number;
  color: string;
  waveDelay: number;
  colorIndex: number;
  glyph: string;
  inkColor: string;
  inkShadow: string;
  ghost: boolean;
  isSeed: boolean;
}

const Facet = React.memo(function Facet({
  points,
  fontSize,
  color,
  waveDelay,
  colorIndex,
  glyph,
  inkColor,
  inkShadow,
  ghost,
  isSeed,
  cell,
}: FacetProps) {
  return (
    <>
      <polygon
        className="mosaic-cell"
        points={points}
        fill={color}
        fillOpacity={ghost ? GHOST_ALPHA : 1}
        stroke={ghost ? 'rgba(226,232,240,0.42)' : 'rgba(15,23,42,0.58)'}
        strokeWidth={ghost ? 0.2 : isSeed ? 0.65 : 0.42}
        strokeLinejoin="round"
        style={{
          transition: 'fill 0.26s ease-out',
          transitionDelay: `${waveDelay}s`,
          // `backwards` not `both`: a settled board holds no live animations.
          animation: `cell-pop-${colorIndex} 0.32s ease-in-out ${waveDelay}s backwards`,
        }}
      />
      {glyph && (
        <text
          x={cell.site[0] * 100}
          y={cell.site[1] * 100}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none select-none"
          style={{ fill: inkColor, fontSize, fontWeight: 900, textShadow: inkShadow }}
        >
          {glyph}
        </text>
      )}
      {isSeed && (
        <g aria-label="Starting shard">
          <circle
            cx={cell.site[0] * 100}
            cy={cell.site[1] * 100}
            r={2.7}
            fill="#0f172a"
            stroke="#22d3ee"
            strokeWidth={0.45}
          />
          <text
            x={cell.site[0] * 100}
            y={cell.site[1] * 100}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#f8fafc"
            fontSize={3.1}
            fontWeight={900}
          >
            S
          </text>
        </g>
      )}
    </>
  );
});

export const MosaicBoard: React.FC<MosaicBoardProps> = ({
  grid,
  size,
  theme = THEMES.arcade,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const side = grid.length || size;
  const layout = useMemo(() => mosaicLayout(side), [side]);
  const distances = useMemo(() => mosaicDistanceField(side), [side]);
  const seedCell = useMemo(() => mosaicSeedCell(side), [side]);

  const glyphs = theme.emoji;
  const showGlyphs = showColorSymbols || !!glyphs;

  const facets = useMemo(
    () =>
      layout.cells.map((cell, index) => {
        const points = cell.polygon
          .map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`)
          .join(' ');
        const xs = cell.polygon.map(([x]) => x);
        const ys = cell.polygon.map(([, y]) => y);
        const width = (Math.max(...xs) - Math.min(...xs)) * 100;
        const height = (Math.max(...ys) - Math.min(...ys)) * 100;
        // Digits live inside a cell that can be small and lopsided, so size
        // them from the cell's own bbox rather than the board.
        const fontSize = Math.max(2.4, Math.min(width, height) * 0.62);
        return { cell, index, points, fontSize };
      }),
    [layout],
  );

  return (
    <div
      className={`relative ${theme.boardBg} p-1.5 sm:p-2.5 rounded-2xl border ${theme.boardBorder} shadow-2xl select-none mx-auto shrink-0 transition-colors duration-300`}
      style={{
        width: frameWidth ?? (boardPx ? `${boardPx}px` : 'min(88vw, min(40vh, 380px))'),
        aspectRatio: '1/1',
      }}
    >
      <svg
        viewBox="-1.5 -1.5 103 103"
        className="w-full h-full"
        role="img"
        aria-label={`Mosaic board, ${side * side} irregular cells`}
      >
        {facets.map(({ cell, index, points, fontSize }) => {
          const r = Math.floor(index / side);
          const c = index % side;
          const colorIndex = grid[r]?.[c] ?? 0;
          const hex = theme.colors[colorIndex] || '#FF595E';
          const ink = showGlyphs && !glyphs ? cellInkOn(hex) : null;
          return (
            <Facet
              key={index}
              cell={cell}
              points={points}
              fontSize={glyphs ? fontSize * 1.2 : fontSize}
              color={hex}
              waveDelay={Math.min(0.24, Math.max(0, distances[index] ?? 0) * 0.014)}
              colorIndex={colorIndex}
              glyph={showGlyphs ? (glyphs?.[colorIndex] ?? String(colorIndex + 1)) : ''}
              inkColor={ink ? ink.color : ''}
              inkShadow={ink ? ink.shadow : ''}
              ghost={!!glyphs}
              isSeed={r === seedCell[0] && c === seedCell[1]}
            />
          );
        })}
      </svg>
    </div>
  );
};
