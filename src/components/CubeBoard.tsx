import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';
import { prefersReducedMotionSnapshot } from '../utils/motionPreferences';
import {
  cubeSeedCell,
  cubeSideForSize,
  cubeTopology,
  getCubeSide,
} from '../utils/cubeEngine';
import { BoardCell } from './BoardCell';

/**
 * Cube surface board (Post-roadmap P11.4).
 *
 * The board is display-only: players pick colors from the palette, never
 * cells. Six `N×N` faces live in a CSS `preserve-3d` scene; drag and arrow
 * keys rotate the scene through CSS variables kept in a ref (no React state
 * per pointer frame). A flat unfolded net is always visible because three
 * faces are hidden at any orientation.
 */
interface CubeBoardProps {
  grid: number[][];
  /** Ladder size (10–18); the stored grid has shape `number[6N][N]`. */
  size: number;
  theme?: GameTheme;
  mode?: GameMode;
  opponent?: MultiplayerOpponent;
  p1Cells?: string[];
  p2Cells?: string[];
  showTerritoryOverlay?: boolean;
  showColorSymbols?: boolean;
  frameWidth?: string;
  boardPx?: number;
  lastMovingPlayer?: 1 | 2;
}

const DEFAULT_ROTATION = { x: -18, y: 35 };
const clampX = (value: number) => Math.max(-85, Math.min(85, value));

/** Cross net: top face above the front, back face after the right face. */
const NET_FACES: Array<{ face: number; col: number; row: number }> = [
  { face: 4, col: 1, row: 0 },
  { face: 1, col: 0, row: 1 },
  { face: 0, col: 1, row: 1 },
  { face: 3, col: 2, row: 1 },
  { face: 5, col: 3, row: 1 },
  { face: 2, col: 1, row: 2 },
];

const faceTransform = (face: number, halfPx: number): string => {
  switch (face) {
    case 0:
      return `translateZ(${halfPx}px)`;
    case 1:
      return `rotateY(90deg) translateZ(${halfPx}px)`;
    case 2:
      return `rotateX(-90deg) translateZ(${halfPx}px)`;
    case 3:
      return `rotateY(-90deg) translateZ(${halfPx}px)`;
    case 4:
      return `rotateX(90deg) translateZ(${halfPx}px)`;
    case 5:
      return `rotateY(180deg) translateZ(${halfPx}px)`;
    default:
      return '';
  }
};

const parseCellKey = (key: string): [number, number] | null => {
  const [r, c] = key.split(',').map(Number);
  return Number.isInteger(r) && Number.isInteger(c) ? [r, c] : null;
};

export const CubeBoard: React.FC<CubeBoardProps> = ({
  grid,
  size,
  theme = THEMES.arcade,
  mode = 'solo',
  opponent,
  p1Cells = [],
  p2Cells = [],
  showTerritoryOverlay = true,
  showColorSymbols = false,
  frameWidth,
  boardPx,
  lastMovingPlayer = 1,
}) => {
  const side = useMemo(() => {
    try {
      return getCubeSide(grid);
    } catch {
      return cubeSideForSize(size);
    }
  }, [grid, size]);

  const p1Set = useMemo(() => new Set(p1Cells), [p1Cells]);
  const p2Set = useMemo(() => new Set(p2Cells), [p2Cells]);
  const p2Label = opponent === 'bot' ? 'BOT' : 'P2';

  const neighbors = useMemo(() => (side > 0 ? cubeTopology(side).neighbors : []), [side]);

  const activeSeedKey = useMemo(() => {
    if (mode === 'solo' || side === 0) {
      const [r, c] = cubeSeedCell(Math.max(1, side));
      return `${r},${c}`;
    }
    return lastMovingPlayer === 2 ? p2Cells[0] : p1Cells[0];
  }, [mode, side, lastMovingPlayer, p1Cells, p2Cells]);

  /** BFS graph distances from the active seed (wave stagger, P4.6 parity). */
  const distances = useMemo(() => {
    if (side === 0 || neighbors.length === 0) return [];
    const seed = parseCellKey(activeSeedKey ?? '');
    if (!seed) return new Int16Array(neighbors.length).fill(0);
    const [seedR, seedC] = seed;
    const start = seedR * side + seedC;
    if (start < 0 || start >= neighbors.length)
      return new Int16Array(neighbors.length).fill(0);
    const dist = new Int16Array(neighbors.length).fill(-1);
    const queue: number[] = [start];
    dist[start] = 0;
    let head = 0;
    while (head < queue.length) {
      const index = queue[head++];
      for (const next of neighbors[index]) {
        if (dist[next] < 0) {
          dist[next] = dist[index] + 1;
          queue.push(next);
        }
      }
    }
    return dist;
  }, [activeSeedKey, neighbors, side]);

  const cubeRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef({ ...DEFAULT_ROTATION });
  const velocityRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const inertiaRef = useRef<number | null>(null);

  const applyRotation = useCallback(() => {
    const el = cubeRef.current;
    if (!el) return;
    const { x, y } = rotationRef.current;
    el.style.setProperty('--cube-x', `${x}deg`);
    el.style.setProperty('--cube-y', `${y}deg`);
    el.style.transform = `rotateX(var(--cube-x)) rotateY(var(--cube-y))`;
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
  }, []);

  const startInertia = useCallback(() => {
    if (prefersReducedMotionSnapshot()) return;
    stopInertia();
    const tick = () => {
      const velocity = velocityRef.current;
      if (Math.abs(velocity.x) < 0.08 && Math.abs(velocity.y) < 0.08) {
        inertiaRef.current = null;
        return;
      }
      rotationRef.current.x = clampX(rotationRef.current.x + velocity.x);
      rotationRef.current.y += velocity.y;
      velocity.x *= 0.92;
      velocity.y *= 0.92;
      applyRotation();
      inertiaRef.current = requestAnimationFrame(tick);
    };
    inertiaRef.current = requestAnimationFrame(tick);
  }, [applyRotation, stopInertia]);

  useEffect(() => {
    applyRotation();
    return stopInertia;
  }, [applyRotation, stopInertia]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    stopInertia();
    dragRef.current = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    rotationRef.current.x = clampX(rotationRef.current.x - dy * 0.3);
    rotationRef.current.y += dx * 0.4;
    if (!prefersReducedMotionSnapshot()) {
      velocityRef.current = { x: -dy * 0.3, y: dx * 0.4 };
    }
    applyRotation();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (Math.abs(velocityRef.current.x) > 0.2 || Math.abs(velocityRef.current.y) > 0.2) {
      startInertia();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    let handled = true;
    stopInertia();
    switch (event.key) {
      case 'ArrowLeft':
        rotationRef.current.y -= 15;
        break;
      case 'ArrowRight':
        rotationRef.current.y += 15;
        break;
      case 'ArrowUp':
        rotationRef.current.x = clampX(rotationRef.current.x - 15);
        break;
      case 'ArrowDown':
        rotationRef.current.x = clampX(rotationRef.current.x + 15);
        break;
      default:
        handled = false;
        break;
    }
    if (handled) {
      event.preventDefault();
      applyRotation();
    }
  };

  const resetView = () => {
    stopInertia();
    rotationRef.current = { ...DEFAULT_ROTATION };
    applyRotation();
  };

  const framePx = boardPx ?? 320;
  const cubePx = Math.max(120, Math.floor(framePx * 0.46));
  const halfPx = Math.floor(cubePx / 2);
  const netFacePx = Math.max(28, Math.floor(framePx * 0.082));

  const faces = side > 0 ? Array.from({ length: 6 }, (_, face) => face) : [];

  return (
    <div
      className={`relative ${theme.boardBg} p-1.5 sm:p-2 rounded-2xl border ${theme.boardBorder} shadow-2xl select-none mx-auto shrink-0 transition-colors duration-300`}
      style={{
        width: boardPx ? `${boardPx}px` : (frameWidth ?? 'min(88vw, min(40vh, 380px))'),
        height: boardPx ? `${boardPx}px` : undefined,
        aspectRatio: boardPx ? undefined : '1/1',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        className="relative flex-1 min-h-0 w-full flex items-center justify-center outline-none"
        style={{
          perspective: 1100,
          touchAction: 'none',
          cursor: 'grab',
        }}
        tabIndex={0}
        role="group"
        aria-label="Interactive cube board. Drag to rotate, or use arrow keys."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* The cube is intentionally not a button/cell-picker: the palette
            is the only move input. */}
        <div
          ref={cubeRef}
          role="img"
          aria-label={`Cube board, ${side} by ${side} cells on each of six faces`}
          className="relative"
          style={{
            width: cubePx,
            height: cubePx,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${DEFAULT_ROTATION.x}deg) rotateY(${DEFAULT_ROTATION.y}deg)`,
          }}
        >
          {faces.map((face) => (
            <div
              key={face}
              data-cube-face={face}
              className="cube-face absolute inset-0"
              style={{
                transform: faceTransform(face, halfPx),
                backfaceVisibility: 'hidden',
                transformStyle: 'preserve-3d',
                display: 'grid',
                gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${side}, minmax(0, 1fr))`,
                gap: 1,
                padding: 3,
                background: 'rgba(2,6,23,0.72)',
                border: '1px solid rgba(148,163,184,0.28)',
                borderRadius: 10,
              }}
            >
              {Array.from({ length: side }, (_, i) =>
                Array.from({ length: side }, (_, j) => {
                  const r = face * side + i;
                  const c = j;
                  const key = `${r},${c}`;
                  const colorIdx = grid[r]?.[c] ?? 0;
                  const cellHex = theme.colors[colorIdx] || '#FF595E';
                  const ink = showColorSymbols ? cellInkOn(cellHex) : null;
                  const isP1Start = mode === 'multiplayer' && p1Cells[0] === key;
                  const isP2Start = mode === 'multiplayer' && p2Cells[0] === key;
                  const isP1Owned = mode === 'multiplayer' && p1Set.has(key);
                  const isP2Owned = mode === 'multiplayer' && p2Set.has(key);
                  const glowClass =
                    showTerritoryOverlay && isP1Owned
                      ? theme.glowP1
                      : showTerritoryOverlay && isP2Owned
                        ? theme.glowP2
                        : '';
                  const dist = distances[r * side + c] ?? 0;
                  const waveDelay = Math.min(0.24, Math.max(0, dist) * 0.014);
                  return (
                    <BoardCell
                      key={key}
                      color={cellHex}
                      radiusClass={theme.cellRadius}
                      glowClass={glowClass}
                      startMarker={isP1Start ? 'p1' : isP2Start ? 'p2' : 'none'}
                      p2Label={p2Label}
                      showOverlay={showTerritoryOverlay}
                      ownedMarker={isP1Owned ? 'p1' : isP2Owned ? 'p2' : 'none'}
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
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Cube · {side}×{side}×6
        </span>
        <button
          type="button"
          onClick={resetView}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 transition-colors hover:bg-slate-700 cursor-pointer"
          title="Reset cube orientation"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          Reset view
        </button>
      </div>

      {/* The flat net is the always-readable overview of hidden faces. */}
      <figure
        aria-label="Unfolded cube net minimap showing all six faces"
        className="rounded-xl border border-slate-700/60 bg-slate-950/55 p-1.5"
      >
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(4, minmax(0, 1fr))`,
          }}
        >
          {NET_FACES.map(({ face, col, row }) => (
            <div
              key={face}
              data-cube-net-face={face}
              className="relative overflow-hidden rounded-md border border-slate-700/60 mx-auto"
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                width: netFacePx,
                height: netFacePx,
              }}
              title={`Face ${face + 1}`}
            >
              <div
                className="grid w-full"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, side)}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: Math.max(0, side) }, (_, i) =>
                  Array.from({ length: Math.max(0, side) }, (_, j) => {
                    const r = face * side + i;
                    const c = j;
                    const key = `${r},${c}`;
                    const colorIdx = grid[r]?.[c] ?? 0;
                    const owned = p1Set.has(key) ? 1 : p2Set.has(key) ? 2 : 0;
                    return (
                      <span
                        key={key}
                        style={{
                          backgroundColor: theme.colors[colorIdx] || '#FF595E',
                          boxShadow:
                            showTerritoryOverlay && owned === 1
                              ? 'inset 0 0 0 1px #22D3EE'
                              : showTerritoryOverlay && owned === 2
                                ? 'inset 0 0 0 1px #FB7185'
                                : undefined,
                          aspectRatio: '1/1',
                        }}
                      />
                    );
                  }),
                )}
              </div>
              <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-slate-950/70 px-1 text-[8px] font-black text-slate-200">
                F{face + 1}
              </span>
            </div>
          ))}
        </div>
      </figure>
    </div>
  );
};
