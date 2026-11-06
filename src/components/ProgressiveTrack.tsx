import React from 'react';
import { Crown, Lock, Swords, Sparkles } from 'lucide-react';
import { PROGRESSIVE_STAGES } from '../utils/themes';

interface ProgressiveTrackProps {
  currentStage: number;
  stageWins: { 1: number[]; 2: number[] };
  p1Name?: string;
  p2Name?: string | null;
}

export const ProgressiveTrack: React.FC<ProgressiveTrackProps> = ({
  currentStage,
  stageWins,
  p1Name = 'P1',
  p2Name = 'P2',
}) => {
  return (
    <div className="w-full bg-slate-900/90 border border-slate-750 rounded-xl p-2 sm:p-2.5 shadow-md">
      {/* Title & Stage Status */}
      <div className="flex items-center justify-between text-[11px] mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-slate-200">Progressive Challenge Track</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
          Stage {currentStage} / 5
        </span>
      </div>

      {/* 5-Step Stage Grid / Track */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
        {PROGRESSIVE_STAGES.map((stage) => {
          const isCurrent = stage.stageNumber === currentStage;
          const p1Won = stageWins[1]?.includes(stage.stageNumber);
          const p2Won = stageWins[2]?.includes(stage.stageNumber);
          const isPassed = stage.stageNumber < currentStage;
          const isUpcoming = stage.stageNumber > currentStage;

          let statusBg = 'bg-slate-950/70 border-slate-800 text-slate-500';
          let badge: React.ReactNode = null;

          if (p1Won) {
            statusBg = 'bg-cyan-950/50 border-cyan-500/60 text-cyan-300';
            badge = (
              <span className="text-[9px] font-black text-cyan-300 flex items-center gap-0.5">
                <Crown className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                <span className="truncate max-w-[36px]">{p1Name.slice(0, 3)}</span>
              </span>
            );
          } else if (p2Won) {
            statusBg = 'bg-rose-950/50 border-rose-500/60 text-rose-300';
            badge = (
              <span className="text-[9px] font-black text-rose-300 flex items-center gap-0.5">
                <Crown className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                <span className="truncate max-w-[36px]">
                  {(p2Name || 'P2').slice(0, 3)}
                </span>
              </span>
            );
          } else if (isPassed) {
            statusBg = 'bg-slate-850 border-slate-700 text-slate-400';
            badge = <span className="text-[8px] font-mono text-slate-400">Tied</span>;
          } else if (isCurrent) {
            statusBg =
              'bg-indigo-950/70 border-indigo-500 text-indigo-200 ring-1 ring-indigo-400/40 shadow-sm shadow-indigo-500/20';
            badge = (
              <span className="text-[9px] font-black text-amber-300 flex items-center gap-0.5 animate-pulse">
                <Swords className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span>Live</span>
              </span>
            );
          } else if (isUpcoming) {
            statusBg = 'bg-slate-950/50 border-slate-850 text-slate-500';
            badge = <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />;
          }

          return (
            <div
              key={stage.stageNumber}
              className={`rounded-lg border p-1 sm:p-1.5 flex flex-col items-center justify-between text-center transition-all ${statusBg}`}
            >
              <div className="text-[9px] sm:text-[10px] font-mono font-bold leading-tight">
                {stage.gridSize}²
              </div>
              <div className="text-[8px] font-mono text-slate-400 my-0.5">
                {stage.colorCount}c
              </div>
              <div className="h-4 flex items-center justify-center">{badge}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
