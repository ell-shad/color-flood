import React, { useMemo } from 'react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
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
  mode?: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
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
  isP1Start: boolean;
  isP2Start: boolean;
  ownedMarker: 'none' | 'p1' | 'p2';
  showOverlay: boolean;
  p2Label: string;
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
  isP1Start,
  isP2Start,
  ownedMarker,
  showOverlay,
  p2Label,
  cell,
}: TileFacetProps) {
  const seedColor = isP2Start ? '#fb7185' : '#22d3ee';
  return (
    <>
      <polygon
        className="mosaic-cell"
        points={points}
        fill={color}
        fillOpacity={ghost ? GHOST_ALPHA : 1}
        stroke={
          ghost
            ? 'rgba(226,232,240,0.42)'
            : isSeed || isP1Start || isP2Start
              ? seedColor
              : showOverlay && ownedMarker === 'p1'
                ? '#22d3ee'
                : showOverlay && ownedMarker === 'p2'
                  ? '#fb7185'
                  : 'rgba(15,23,42,0.58)'
        }
        strokeWidth={ghost ? 0.2 : isSeed || isP1Start || isP2Start ? 0.85 : 0.42}
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
      {(isP1Start || isP2Start) && (
        <text
          x={cell.site[0] * 100}
          y={cell.site[1] * 100}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f8fafc"
          fontSize={3.4}
          fontWeight={900}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
        >
          {isP1Start ? 'P1' : p2Label}
        </text>
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
  mode = 'solo',
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const cols = grid[0]?.length ?? 0;
  const p1Set = useMemo(() => new Set(p1Cells), [p1Cells]);
  const p2Set = useMemo(() => new Set(p2Cells), [p2Cells]);
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
              isSeed={mode === 'solo' && index === seed}
              isP1Start={
                mode === 'multiplayer' &&
                p1Cells[0] === `${Math.floor(index / cols)},${index % cols}`
              }
              isP2Start={
                mode === 'multiplayer' &&
                p2Cells[0] === `${Math.floor(index / cols)},${index % cols}`
              }
              ownedMarker={
                mode === 'multiplayer' &&
                p1Set.has(`${Math.floor(index / cols)},${index % cols}`)
                  ? 'p1'
                  : mode === 'multiplayer' &&
                      p2Set.has(`${Math.floor(index / cols)},${index % cols}`)
                    ? 'p2'
                    : 'none'
              }
              showOverlay={showTerritoryOverlay}
              p2Label={opponent === 'bot' ? 'BOT' : 'P2'}
            />
          );
        })}
      </svg>
    </div>
  );
};
