import React, { useMemo } from 'react';
import { GameTheme } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';
import { wheelGeometry } from '../utils/circleEngine';

/**
 * P7.2: polar wheel board — rings × radial sectors drawn as SVG annular
 * sectors, hollow center, flooding from the innermost ring outward.
 *
 * Mirrors GameGrid's rendering pipeline (P4.6) with SVG plumbing:
 *  - cell fills transition `fill` over the same 0.26 s ease-out with a ring
 *    stagger (the polar analogue of the square's `dist-from-root` wave), and
 *  - the scale pop is named per palette index (`cell-pop-0..7`), so it
 *    restarts when (and only when) a sector changes color instead of replaying
 *    across the whole wheel on every move — SVG paths get `transform-box:
 *    fill-box` so the pop scales each sector around its own bbox center
 *    (.wheel-cell rule in index.css).
 *
 * `grid[r]` = ring r (0 = innermost), `grid[r][c]` = clockwise sector c.
 */

interface WheelBoardProps {
  grid: number[][];
  /** Ladder size (10..18) — maps to the wheel geometry table. */
  size: number;
  theme?: GameTheme;
  /** P5.4: overlay digit (palette index + 1) per cell — color-blind aid. */
  showColorSymbols?: boolean;
  /** P7.3: frame width override (the replay modal renders it smaller). */
  frameWidth?: string;
  /** Measured square edge from useBoardFit — the board fills its box. */
  boardPx?: number;
}

interface WheelCellProps {
  d: string;
  /** Centroid (SVG user units) for the optional digit overlay. */
  cx: number;
  cy: number;
  /** Ring thickness scales the digit with the board's own geometry. */
  fontSize: number;
  color: string;
  waveDelay: number;
  /**
   * Palette index — the pop keyframe is named per color, so the animation
   * restarts when (and only when) this sector's color changes.
   */
  colorIndex: number;
  glyph: string;
  inkColor: string;
  inkShadow: string;
}

const WheelCell = React.memo(function WheelCell({
  d,
  cx,
  cy,
  fontSize,
  color,
  waveDelay,
  colorIndex,
  glyph,
  inkColor,
  inkShadow,
}: WheelCellProps) {
  return (
    <>
      <path
        className="wheel-cell"
        d={d}
        fill={color}
        style={{
          transition: 'fill 0.26s ease-out',
          transitionDelay: `${waveDelay}s`,
          // `backwards` not `both`: a settled wheel holds no live animations.
          animation: `cell-pop-${colorIndex} 0.32s ease-in-out ${waveDelay}s backwards`,
        }}
      />
      {glyph && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none select-none"
          style={{
            fill: inkColor,
            fontSize,
            fontWeight: 900,
            textShadow: inkShadow,
          }}
        >
          {glyph}
        </text>
      )}
    </>
  );
});

/** One annular sector (rings/hosted angles in radians, sweep = clockwise). */
const sectorPath = (
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string => {
  const x0i = cx + r0 * Math.cos(a0);
  const y0i = cy + r0 * Math.sin(a0);
  const x0o = cx + r1 * Math.cos(a0);
  const y0o = cy + r1 * Math.sin(a0);
  const x1o = cx + r1 * Math.cos(a1);
  const y1o = cy + r1 * Math.sin(a1);
  const x1i = cx + r0 * Math.cos(a1);
  const y1i = cy + r0 * Math.sin(a1);
  return [
    `M ${x0i} ${y0i}`,
    `L ${x0o} ${y0o}`,
    `A ${r1} ${r1} 0 0 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${r0} ${r0} 0 0 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ');
};

export const WheelBoard: React.FC<WheelBoardProps> = ({
  grid,
  size,
  theme = THEMES.arcade,
  showColorSymbols = false,
  frameWidth,
  boardPx,
}) => {

  const shape = useMemo(() => wheelGeometry(size), [size]);
  const cells = useMemo(() => {
    const { rings, sectors } = shape;
    const CX = 50;
    const CY = 50;
    const OUTER = 49;
    /**
     * Ring 0 is the flood source — rendered as the small core disc (P7.2b),
     * so the CELLS span rings 1..rings-1 and are all scrambled at start.
     */
    const INNER = 9;
    // Ring 0 is the flood source, rendered as the small core disc — the
    // drawable cells are board rings 1..rings-1, all scrambled at start.
    const cellRings = rings - 1;
    const step = (OUTER - INNER) / cellRings;
    const out: Array<{
      d: string;
      cx: number;
      cy: number;
      fontSize: number;
    }> = [];
    for (let r = 0; r < cellRings; r++) {
      // Micro-gaps: shrink each sector slightly so the board background
      // (the frame itself) shows through as the cell divider.
      const r0 = INNER + r * step + (r === 0 ? 0 : 0.35);
      const r1 = INNER + (r + 1) * step - (r === cellRings - 1 ? 0 : 0.35);
      for (let c = 0; c < sectors; c++) {
        const gap = 0.2 / Math.max(r0, r1);
        const a0 = (c / sectors) * 2 * Math.PI - Math.PI / 2 + gap;
        const a1 = ((c + 1) / sectors) * 2 * Math.PI - Math.PI / 2 - gap;
        const am = (a0 + a1) / 2;
        const rm = (r0 + r1) / 2;
        out.push({
          d: sectorPath(CX, CY, r0, r1, a0, a1),
          cx: CX + rm * Math.cos(am),
          cy: CY + rm * Math.sin(am),
          fontSize: Math.max(2.1, step * 0.58),
        });
      }
    }
    return out;
  }, [shape]);

  // The core disc always mirrors ring 0's uniform color — the flood source.
  const seedHex = theme.colors[grid[0]?.[0] ?? 0] || '#FF595E';

  return (
    <div
      className={`relative ${theme.boardBg} p-1.5 sm:p-2.5 rounded-2xl border ${theme.boardBorder} shadow-2xl overflow-hidden select-none mx-auto shrink-0 transition-colors duration-300`}
      style={{
        width: frameWidth ?? (boardPx ? `${boardPx}px` : 'min(88vw, min(40vh, 380px))'),
        height: frameWidth ? undefined : boardPx ? `${boardPx}px` : undefined,
        aspectRatio: '1/1',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        role="img"
        aria-label={`${shape.rings - 1} rings by ${shape.sectors} sectors color wheel board`}
      >
        {/* Core disc (ring 0 as a small nub, P7.2b): the starter color — it
            always shows the current flood color, so the source of the radial
            flood is visible at a glance. The sector rings around it are all
            scrambled at start. */}
        <circle
          cx={50}
          cy={50}
          r={7}
          fill={seedHex}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={0.8}
          style={{ transition: 'fill 0.26s ease-out' }}
        />
        {cells.map(({ d, cx, cy, fontSize }, i) => {
          const rr = Math.floor(i / shape.sectors) + 1; // board ring index
          const c = i % shape.sectors;
          const cell = grid[rr]?.[c] ?? 0;
          const waveDelay = Math.min(0.24, rr * 0.014);
          const hex = theme.colors[cell] || '#FF595E';
          const ink = showColorSymbols ? cellInkOn(hex) : null;
          return (
            <WheelCell
              key={`${rr}-${c}`}
              d={d}
              cx={cx}
              cy={cy}
              fontSize={fontSize}
              color={hex}
              waveDelay={waveDelay}
              colorIndex={cell}
              glyph={ink ? String(cell + 1) : ''}
              inkColor={ink ? ink.color : ''}
              inkShadow={ink ? ink.shadow : ''}
            />
          );
        })}
      </svg>
    </div>
  );
};
