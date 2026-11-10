import React, { useMemo } from 'react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
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
  mode?: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
  lastMovingPlayer?: 1 | 2;
  layoutSeed?: number;
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
  isP1Start: boolean;
  isP2Start: boolean;
  ownedMarker: 'none' | 'p1' | 'p2';
  showOverlay: boolean;
  p2Label: string;
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
  isP1Start,
  isP2Start,
  ownedMarker,
  showOverlay,
  p2Label,
  cell,
}: FacetProps) {
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

export const MosaicBoard: React.FC<MosaicBoardProps> = ({
  grid,
  size,
  theme = THEMES.arcade,
  mode = 'solo',
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  lastMovingPlayer = 1,
  layoutSeed = 0,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {
  const side = grid.length || size;
  const layout = useMemo(() => mosaicLayout(side, layoutSeed), [side, layoutSeed]);
  const seedCell = useMemo(() => mosaicSeedCell(side, layoutSeed), [side, layoutSeed]);
  const distances = useMemo(() => {
    if (mode !== 'multiplayer') return mosaicDistanceField(side, layoutSeed);
    const activeKey = lastMovingPlayer === 2 ? p2Cells[0] : p1Cells[0];
    const [ar, ac] = (activeKey ?? `${seedCell[0]},${seedCell[1]}`)
      .split(',')
      .map(Number);
    const start = ar * side + ac;
    const distances = new Int16Array(layout.cells.length).fill(-1);
    if (start < 0 || start >= layout.cells.length)
      return mosaicDistanceField(side, layoutSeed);
    distances[start] = 0;
    const queue: number[] = [start];
    let head = 0;
    while (head < queue.length) {
      const index = queue[head++];
      for (const next of layout.cells[index].neighbours) {
        if (distances[next] === -1) {
          distances[next] = distances[index] + 1;
          queue.push(next);
        }
      }
    }
    return distances;
  }, [lastMovingPlayer, layout, mode, p1Cells, p2Cells, seedCell, side, layoutSeed]);
  const p1Set = useMemo(() => new Set(p1Cells), [p1Cells]);
  const p2Set = useMemo(() => new Set(p2Cells), [p2Cells]);
  const p2Label = opponent === 'bot' ? 'BOT' : 'P2';

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
              isSeed={mode === 'solo' && r === seedCell[0] && c === seedCell[1]}
              isP1Start={mode === 'multiplayer' && p1Cells[0] === `${r},${c}`}
              isP2Start={mode === 'multiplayer' && p2Cells[0] === `${r},${c}`}
              ownedMarker={
                mode === 'multiplayer' && p1Set.has(`${r},${c}`)
                  ? 'p1'
                  : mode === 'multiplayer' && p2Set.has(`${r},${c}`)
                    ? 'p2'
                    : 'none'
              }
              showOverlay={showTerritoryOverlay}
              p2Label={p2Label}
            />
          );
        })}
      </svg>
    </div>
  );
};
