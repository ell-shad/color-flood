import React, { useMemo } from 'react';
import type { GameTheme } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';
import { GHOST_ALPHA } from './BoardCell';
import type { Point } from '../utils/mosaicEngine';

/** A shared convex cell used by the triangle and hexagon tile boards. */
export interface TilingCell {
  site: Point;
  polygon: Point[];
  neighbours: number[];
}

interface TilingBoardProps {
  grid: number[][];
  cells: TilingCell[];
  seed: number;
  distances: Int16Array;
  label: string;
  theme?: GameTheme;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
}

interface TileFacetProps {
  cell: TilingCell;
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

const TileFacet = React.memo(function TileFacet({
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
}: TileFacetProps) {
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
        <g aria-label="Starting cell">
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

/**
 * Shared SVG renderer for regular tiling boards whose game topology is the
 * same polygon graph the player sees (triangle and hexagon-hive boards).
 */
export const TilingBoard: React.FC<TilingBoardProps> = ({
  grid,
  cells,
  seed,
  distances,
  label,
  theme = THEMES.arcade,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const cols = grid[0]?.length ?? 0;
  const glyphs = theme.emoji;
  const showGlyphs = showColorSymbols || !!glyphs;

  const facets = useMemo(
    () =>
      cells.map((cell, index) => {
        const points = cell.polygon
          .map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`)
          .join(' ');
        const xs = cell.polygon.map(([x]) => x);
        const ys = cell.polygon.map(([, y]) => y);
        const width = (Math.max(...xs) - Math.min(...xs)) * 100;
        const height = (Math.max(...ys) - Math.min(...ys)) * 100;
        const fontSize = Math.max(2.4, Math.min(width, height) * 0.62);
        return { cell, index, points, fontSize };
      }),
    [cells],
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
        aria-label={label}
      >
        {facets.map(({ cell, index, points, fontSize }) => {
          const colorIndex = grid[Math.floor(index / cols)]?.[index % cols] ?? 0;
          const hex = theme.colors[colorIndex] || '#FF595E';
          const ink = showGlyphs && !glyphs ? cellInkOn(hex) : null;
          return (
            <TileFacet
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
              isSeed={index === seed}
            />
          );
        })}
      </svg>
    </div>
  );
};
