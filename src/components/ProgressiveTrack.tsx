import React from 'react';
import { Crown, Lock, Swords, Sparkles } from 'lucide-react';
import { PROGRESSIVE_STAGES } from '../utils/themes';
import { assertNever } from '../utils/boardShape';
import { cubeSideForSize } from '../utils/cubeEngine';
import { wheelGeometry } from '../utils/circleEngine';
import type { BoardShape } from '../types';

interface ProgressiveTrackProps {
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  p1Name?: string;
  p2Name?: string | null;
  /** P9: wheels are rings × sectors, so a "10²" pill would be misleading. */
  shape?: BoardShape;
}

/**
 * Compact ladder strip.
 *
 * The old card stacked a title row and five tall tiles (~100px) at the very
 * top of multiplayer. This keeps every stage, its size/colors, the current
 * stage and who won what, in a single thin row that reads like progress.
 */
export const ProgressiveTrack: React.FC<ProgressiveTrackProps> = ({
  currentStage,
  stageWins,
  p1Name = 'P1',
  p2Name = 'P2',
  shape = 'classic' as BoardShape,
}) => {
  return (
    <div className="w-full bg-slate-900/90 border border-slate-750 rounded-xl px-2 py-1 shadow-md">
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 shrink-0">
          <Sparkles className="w-3 h-3 text-amber-400" aria-hidden="true" />
          <span className="text-[9px] font-mono font-bold text-amber-300 whitespace-nowrap">
            Stage {currentStage}/5
          </span>
        </div>

        <div className="flex-1 flex items-center gap-0.5 min-w-0">
          {PROGRESSIVE_STAGES.map((stage) => {
            const isCurrent = stage.stageNumber === currentStage;
            const p1Won = stageWins[1]?.includes(stage.stageNumber);
            const p2Won = stageWins[2]?.includes(stage.stageNumber);
            const isPassed = stage.stageNumber < currentStage;
            const isUpcoming = stage.stageNumber > currentStage;

            let statusBg = 'bg-slate-950/70 border-slate-800 text-slate-500';
            let icon: React.ReactNode = null;

            if (p1Won) {
              statusBg = 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300';
              icon = <Crown className="w-2.5 h-2.5 text-cyan-400 shrink-0" />;
            } else if (p2Won) {
              statusBg = 'bg-rose-950/60 border-rose-500/60 text-rose-300';
              icon = <Crown className="w-2.5 h-2.5 text-rose-400 shrink-0" />;
            } else if (isPassed) {
              statusBg = 'bg-slate-850 border-slate-700 text-slate-400';
            } else if (isCurrent) {
              statusBg =
                'bg-indigo-950/70 border-indigo-500 text-indigo-200 ring-1 ring-indigo-400/40';
              icon = (
                <Swords className="w-2.5 h-2.5 text-amber-400 shrink-0 animate-pulse" />
              );
            } else if (isUpcoming) {
              statusBg = 'bg-slate-950/50 border-slate-850 text-slate-400';
              icon = <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />;
            }

            const owner = p1Won
              ? `won by ${p1Name}`
              : p2Won
                ? `won by ${p2Name || 'P2'}`
                : '';
            const status = owner
              ? owner
              : isCurrent
                ? 'live'
                : isPassed
                  ? 'tied'
                  : 'locked';

            let sizeText = `${stage.gridSize}²`;
            let sizeWords = `${stage.gridSize} by ${stage.gridSize}`;
            switch (shape) {
              case 'wheel': {
                const geo = wheelGeometry(stage.gridSize);
                sizeText = `${geo.rings}×${geo.sectors}`;
                sizeWords = `${geo.rings} rings by ${geo.sectors} sectors`;
                break;
              }
              case 'cube': {
                const side = cubeSideForSize(stage.gridSize);
                sizeText = `${side}×${side}×6`;
                sizeWords = `cube with ${side} cells per side`;
                break;
              }
              // Solo-only topologies never reach a multiplayer ladder; the
              // case keeps the switch exhaustive.
              case 'mosaic':
              case 'classic':
                break;
              default:
                assertNever(shape);
                break;
            }

            return (
              <div
                key={stage.stageNumber}
                title={`Stage ${stage.stageNumber}: ${sizeWords}, ${stage.colorCount} colors — ${status}`}
                aria-label={`Stage ${stage.stageNumber} of 5, ${sizeWords}, ${stage.colorCount} colors, ${status}`}
                className={`flex-1 min-w-0 rounded-md border px-0.5 py-0.5 flex items-center justify-center gap-0.5 transition-all ${statusBg}`}
              >
                {icon}
                <span className="text-[8px] font-mono font-bold truncate">
                  {sizeText}·{stage.colorCount}c
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
