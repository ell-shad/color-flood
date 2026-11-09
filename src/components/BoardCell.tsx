import React from 'react';
import { withAlpha } from '../utils/contrast';

export interface BoardCellProps {
  color: string;
  radiusClass: string;
  glowClass: string;
  /** `start` rings the solo flood-origin cell of topologies that need it. */
  startMarker: 'none' | 'p1' | 'p2' | 'start';
  p2Label: string;
  showOverlay: boolean;
  ownedMarker: 'none' | 'p1' | 'p2';
  waveDelay: number;
  colorIndex: number;
  symbolGlyph: string;
  inkColor: string;
  inkShadow: string;
  /** Explicit glyph size in px (emoji glyphs scale with the cell). */
  glyphFontSize?: number;
  /** Emoji skin: the glyph over a faint shade of the cell's own colour. */
  ghost?: boolean;
}

/**
 * P4.6: memoized display cell shared by the square and cube boards.
 * Color updates ride CSS `transition: background-color` plus the
 * palette-index-named scale pop, so only actually recolored cells animate.
 */
/** Opacity of the emoji skin's tint: a shade of the cell colour, not the fill. */
export const GHOST_ALPHA = 0.2;

export const BoardCell = React.memo(function BoardCell({
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
  glyphFontSize,
  ghost = false,
}: BoardCellProps) {
  return (
    <div
      className={`relative ${radiusClass} shadow-inner flex items-center justify-center ${glowClass}`}
      style={{
        // A ghost cell keeps a shade (not the full colour) of its own hue plus
        // a hairline, so the grid — and therefore the flood's connectivity —
        // stays readable while the emoji carries the identity.
        backgroundColor: ghost ? withAlpha(color, GHOST_ALPHA) : color,
        boxShadow: ghost ? 'inset 0 0 0 1px rgba(148,163,184,0.14)' : undefined,
        transition: 'background-color 0.26s ease-out',
        transitionDelay: `${waveDelay}s`,
        animation: `cell-pop-${colorIndex} 0.32s ease-in-out ${waveDelay}s backwards`,
      }}
    >
      {symbolGlyph && (
        <span
          className={`pointer-events-none select-none font-black leading-none ${
            glyphFontSize ? '' : 'text-[11px] sm:text-[13px]'
          }`}
          style={{
            color: inkColor || undefined,
            textShadow: inkShadow || undefined,
            fontSize: glyphFontSize ? `${glyphFontSize}px` : undefined,
          }}
        >
          {symbolGlyph}
        </span>
      )}
      {startMarker === 'start' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 ring-2 ring-white/90 shadow-[0_0_0_1.5px_rgba(2,6,23,0.85)]"
          style={{ borderRadius: 'inherit' }}
        />
      )}
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
      {showOverlay && startMarker === 'none' && ownedMarker === 'p1' && (
        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-cyan-100/90 shadow-sm pointer-events-none" />
      )}
      {showOverlay && startMarker === 'none' && ownedMarker === 'p2' && (
        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-rose-100/90 shadow-sm pointer-events-none" />
      )}
    </div>
  );
});
