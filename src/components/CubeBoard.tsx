import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { GameMode, GameTheme, MultiplayerOpponent } from '../types';
import { THEMES } from '../utils/themes';
import { cellInkOn } from '../utils/contrast';
import { prefersReducedMotionSnapshot } from '../utils/motionPreferences';
import {
  cubeFaceDisplay,
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
 * per pointer frame).
 *
 * The face placements are derived from the engine's own face frames
 * (`cubeFaceDisplay`), so what the player rotates is exactly the surface graph
 * the flood walks: neighbouring cells are always drawn on a shared cube edge,
 * including across the twelve geometric seams. The unfolded net is a real cube
 * net (faces drawn side by side really are adjacent) and can be hidden.
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

/**
 * Default view: turn the seed face (`x = 0` in cube coordinates) to the
 * front-left so the flood origin is visible from the first move.
 */
const DEFAULT_ROTATION = { x: -26, y: 45 };
const clampX = (value: number) => Math.max(-85, Math.min(85, value));

/**
 * Cross net: `face 4` above the seed face, its three neighbours around it and
 * the opposite face (`face 1`) folded off `face 3`. Every pair of faces that
 * touches in this layout is adjacent on the cube — the previous net put the
 * two opposite faces side by side.
 */
const NET_FACES: Array<{ face: number; col: number; row: number }> = [
  { face: 4, col: 1, row: 0 },
  { face: 2, col: 0, row: 1 },
  { face: 0, col: 1, row: 1 },
  { face: 3, col: 2, row: 1 },
  { face: 1, col: 3, row: 1 },
  { face: 5, col: 1, row: 2 },
];

interface FacePlacement {
  /** True when the storage grid has to be read transposed on screen. */
  transpose: boolean;
  transform: string;
}

/**
 * CSS `matrix3d` placement of one face from its engine frame. Cube coordinates
 * map straight onto CSS coordinates (x right, y down, z toward the viewer), so
 * the local column/row/normal axes are simply the matrix columns.
 */
const facePlacement = (face: number, halfPx: number): FacePlacement => {
  const { colAxis, rowAxis, normal, transpose } = cubeFaceDisplay(face);
  const columns = [colAxis, rowAxis, normal]
    .map((axis) => `${axis[0]},${axis[1]},${axis[2]},0`)
    .join(',');
  const translate = `${normal[0] * halfPx},${normal[1] * halfPx},${normal[2] * halfPx},1`;
  return { transpose, transform: `matrix3d(${columns},${translate})` };
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
  /** The unfolded net is an optional overview of the three hidden faces. */
  const [showFaces, setShowFaces] = useState(true);

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
    dragRef.current = {
      id: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
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
  // Hiding the net gives the cube the room the panel occupied.
  const cubePx = Math.max(120, Math.floor(framePx * (showFaces ? 0.46 : 0.52)));
  const halfPx = Math.floor(cubePx / 2);
  const netFacePx = Math.max(28, Math.floor(framePx * 0.082));

  const placements = useMemo(
    () => Array.from({ length: 6 }, (_, face) => facePlacement(face, halfPx)),
    [halfPx],
  );
  const faces = side > 0 ? Array.from({ length: 6 }, (_, face) => face) : [];
  // The emoji skin is flat-board only, so 3D faces always show colour fills
  // (and the optional colour-blind digits), never glyph-only cells.
  const soloSeedKey = mode === 'solo' ? activeSeedKey : null;

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
            transform: `rotateX(var(--cube-x, ${DEFAULT_ROTATION.x}deg)) rotateY(var(--cube-y, ${DEFAULT_ROTATION.y}deg))`,
          }}
        >
          {faces.map((face) => {
            const placement = placements[face];
            return (
              <div
                key={face}
                data-cube-face={face}
                className="cube-face absolute inset-0"
                style={{
                  transform: placement.transform,
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
                {Array.from({ length: side }, (_, dr) =>
                  Array.from({ length: side }, (_, dc) => {
                    // Display cell (dr, dc) shows storage cell (i, j); the
                    // transposed faces keep every face right-handed on screen.
                    const i = placement.transpose ? dc : dr;
                    const j = placement.transpose ? dr : dc;
                    const r = face * side + i;
                    const c = j;
                    const key = `${r},${c}`;
                    const colorIdx = grid[r]?.[c] ?? 0;
                    const cellHex = theme.colors[colorIdx] || '#FF595E';
                    const isP1Start = mode === 'multiplayer' && p1Cells[0] === key;
                    const isP2Start = mode === 'multiplayer' && p2Cells[0] === key;
                    const isStart = soloSeedKey === key;
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
                    const glyph = showColorSymbols ? String(colorIdx + 1) : '';
                    const ink = showColorSymbols ? cellInkOn(cellHex) : null;
                    return (
                      <BoardCell
                        key={key}
                        color={cellHex}
                        radiusClass={theme.cellRadius}
                        glowClass={glowClass}
                        startMarker={
                          isP1Start ? 'p1' : isP2Start ? 'p2' : isStart ? 'start' : 'none'
                        }
                        p2Label={p2Label}
                        showOverlay={showTerritoryOverlay}
                        ownedMarker={isP1Owned ? 'p1' : isP2Owned ? 'p2' : 'none'}
                        waveDelay={waveDelay}
                        colorIndex={colorIdx}
                        symbolGlyph={glyph}
                        inkColor={ink ? ink.color : ''}
                        inkShadow={ink ? ink.shadow : ''}
                      />
                    );
                  }),
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Cube · {side}×{side}×6
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFaces((prev) => !prev)}
            aria-pressed={showFaces}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 transition-colors hover:bg-slate-700 cursor-pointer"
            title={
              showFaces ? 'Hide the unfolded face panel' : 'Show the unfolded face panel'
            }
          >
            {showFaces ? (
              <EyeOff className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Eye className="w-3 h-3" aria-hidden="true" />
            )}
            Faces
          </button>
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
      </div>

      {/* The flat net is the always-readable overview of hidden faces. */}
      {showFaces && (
        <figure
          aria-label="Unfolded cube net minimap showing all six faces"
          className="rounded-xl border border-slate-700/60 bg-slate-950/55 p-1.5"
        >
          <div
            className="grid gap-1 justify-center"
            style={{
              // Fixed face-sized tracks keep the net folded together instead of
              // stretching its four columns across the whole panel.
              gridTemplateColumns: `repeat(4, ${netFacePx}px)`,
              gridAutoRows: `${netFacePx}px`,
            }}
          >
            {NET_FACES.map(({ face, col, row }) => {
              const transpose =
                placements[face]?.transpose ?? cubeFaceDisplay(face).transpose;
              return (
                <div
                  key={face}
                  data-cube-net-face={face}
                  className="relative overflow-hidden rounded-md border border-slate-700/60"
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
                    {Array.from({ length: Math.max(0, side) }, (_, dr) =>
                      Array.from({ length: Math.max(0, side) }, (_, dc) => {
                        const i = transpose ? dc : dr;
                        const j = transpose ? dr : dc;
                        const r = face * side + i;
                        const c = j;
                        const key = `${r},${c}`;
                        const colorIdx = grid[r]?.[c] ?? 0;
                        const owned = p1Set.has(key) ? 1 : p2Set.has(key) ? 2 : 0;
                        const isStart = soloSeedKey === key;
                        return (
                          <span
                            key={key}
                            style={{
                              backgroundColor: theme.colors[colorIdx] || '#FF595E',
                              boxShadow:
                                showTerritoryOverlay && owned === 1
                                  ? 'inset 0 0 0 1.5px #22D3EE'
                                  : showTerritoryOverlay && owned === 2
                                    ? 'inset 0 0 0 1.5px #FB7185'
                                    : isStart
                                      ? 'inset 0 0 0 1.5px #FFFFFF'
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
              );
            })}
          </div>
          {soloSeedKey && (
            <figcaption className="mt-1 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              White ring = flood origin
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
};
