/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { GRID_SIZES, COLOR_COUNTS } from '../utils/floodLogic';
import { BotDifficulty, GameMode, GridSize, ColorCount, MultiplayerOpponent, ThemeId, ChallengeType } from '../types';
import { THEMES } from '../utils/themes';
import { Eye, RotateCcw, Download, Sparkles, Palette, Trophy } from 'lucide-react';

interface SettingsPanelProps {
  gridSize: GridSize;
  onChangeGridSize: (size: GridSize) => void;
  colorCount: ColorCount;
  onChangeColorCount: (count: ColorCount) => void;
  mode: GameMode;
  opponent: MultiplayerOpponent;
  onChangeOpponent: (opp: MultiplayerOpponent) => void;
  botDifficulty: BotDifficulty;
  onChangeBotDifficulty: (diff: BotDifficulty) => void;
  showTerritoryOverlay: boolean;
  onToggleTerritoryOverlay: () => void;
  onResetSeries: () => void;
  onDownloadIcon: () => void;
  onSetToEasiest?: () => void;
  activeThemeId: ThemeId;
  onOpenThemeModal: () => void;
  challengeType?: ChallengeType;
  onChangeChallengeType?: (type: ChallengeType) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  gridSize,
  onChangeGridSize,
  colorCount,
  onChangeColorCount,
  mode,
  opponent,
  onChangeOpponent,
  botDifficulty,
  onChangeBotDifficulty,
  showTerritoryOverlay,
  onToggleTerritoryOverlay,
  onResetSeries,
  onDownloadIcon,
  onSetToEasiest,
  activeThemeId,
  onOpenThemeModal,
  challengeType = 'standard',
  onChangeChallengeType,
}) => {
  const currentTheme = THEMES[activeThemeId] || THEMES.arcade;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="w-full max-w-lg mx-auto overflow-hidden mb-2 select-none"
    >
      <div className="bg-slate-850/95 border border-slate-700/60 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xl">
        {/* Quick Easiest Preset & Theme Bar */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-750 gap-2 flex-wrap">
          <div>
            <span className="text-xs font-bold text-white block">Difficulty & Aesthetics</span>
            <span className="text-[10px] text-slate-400">Default is always easiest setup</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenThemeModal}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-amber-300 border border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Change Color Theme"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              <span>Theme: {currentTheme.name.split(' ')[0]}</span>
            </button>

            {onSetToEasiest && (
              <button
                onClick={onSetToEasiest}
                className="px-2 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Easiest</span>
              </button>
            )}
          </div>
        </div>

        {/* In Multiplayer: Progressive Track vs Standard Match Mode */}
        {mode === 'multiplayer' && onChangeChallengeType && (
          <div className="space-y-1.5 pb-2.5 border-b border-slate-750">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Multiplayer Challenge Ladder
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChangeChallengeType('progressive')}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  challengeType === 'progressive'
                    ? 'bg-amber-600 text-white shadow-md border border-amber-400/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Progressive Track (5 Stages)</span>
              </button>
              <button
                onClick={() => onChangeChallengeType('standard')}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  challengeType === 'standard'
                    ? 'bg-indigo-600 text-white shadow-md border border-indigo-400/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Standard Match</span>
              </button>
            </div>
          </div>
        )}

        {/* Grid Size Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Grid Size
            </label>
            <span className="text-[10px] text-indigo-400 font-mono">10x10 is easiest</span>
          </div>
          <div className="flex gap-1.5">
            {GRID_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => onChangeGridSize(size)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                  gridSize === size
                    ? 'bg-indigo-600 text-white shadow border border-indigo-400/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                }`}
              >
                <span>{size}²</span>
                {size === 10 && (
                  <span className="text-[7px] uppercase tracking-wider font-mono opacity-80">Easy</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Color Count Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Colors Count
            </label>
            <span className="text-[10px] text-indigo-400 font-mono">4 Colors is easiest</span>
          </div>
          <div className="flex gap-1.5">
            {COLOR_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => onChangeColorCount(count)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                  colorCount === count
                    ? 'bg-indigo-600 text-white shadow border border-indigo-400/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                }`}
              >
                <span>{count} Colors</span>
                {count === 4 && (
                  <span className="text-[7px] uppercase tracking-wider font-mono opacity-80">Easy</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 2-Player Options */}
        {mode === 'multiplayer' && (
          <div className="space-y-2.5 pt-2 border-t border-slate-750">
            {/* Bot Difficulty (if vs Bot) */}
            {opponent === 'bot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    AI Difficulty
                  </label>
                  <span className="text-[10px] text-cyan-400 font-mono">Easy is default</span>
                </div>
                <div className="flex gap-1.5">
                  {(['easy', 'medium', 'master'] as BotDifficulty[]).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => onChangeBotDifficulty(diff)}
                      className={`flex-1 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        botDifficulty === diff
                          ? 'bg-cyan-600 text-white shadow border border-cyan-400/40'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-750 border border-slate-700/50'
                      }`}
                    >
                      <span>{diff}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Territory Highlight Toggle & Reset Series */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={onToggleTerritoryOverlay}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Glow: <strong className="text-white">{showTerritoryOverlay ? 'ON' : 'OFF'}</strong>
                </span>
              </button>

              <button
                onClick={onResetSeries}
                className="text-xs text-rose-300 hover:text-rose-200 flex items-center gap-1 cursor-pointer bg-rose-950/40 px-2 py-1 rounded-lg border border-rose-500/30"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Series</span>
              </button>
            </div>
          </div>
        )}

        {/* Download Icon utility */}
        <div className="pt-2 border-t border-slate-750">
          <button
            onClick={onDownloadIcon}
            className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700/50"
          >
            <Download className="w-3 h-3 text-indigo-400" />
            <span>Download Favicon PNG (512x512)</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
