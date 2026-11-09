import React from 'react';
import { motion } from 'motion/react';
import { GRID_SIZES, COLOR_COUNTS } from '../utils/floodLogic';
import {
  BotDifficulty,
  GameMode,
  GridSize,
  ColorCount,
  BoardShape,
  MultiplayerOpponent,
  ThemeId,
  ChallengeType,
} from '../types';
import { THEMES } from '../utils/themes';
import {
  Eye,
  RotateCcw,
  Download,
  Sparkles,
  Palette,
  Trophy,
  Lightbulb,
  Volume2,
  Shapes,
  Square,
  Circle,
  Box,
  X,
  Info,
} from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';

const BOARD_SHAPE_OPTIONS: Array<{
  id: BoardShape;
  label: string;
  title: string;
  Icon: typeof Square;
  activeClass: string;
}> = [
  {
    id: 'classic',
    label: 'Classic',
    title: 'Classic square flood from the top-left corner',
    Icon: Square,
    activeClass: 'bg-indigo-600 text-white shadow border border-indigo-400/50',
  },
  {
    id: 'wheel',
    label: 'Wheel',
    title: 'Polar wheel: hollow center, flood grows ring by ring',
    Icon: Circle,
    activeClass: 'bg-fuchsia-600 text-white shadow border border-fuchsia-400/50',
  },
  {
    id: 'cube',
    label: 'Cube',
    title: 'Cube surface: six faces, flood wraps across edges',
    Icon: Box,
    activeClass: 'bg-emerald-600 text-white shadow border border-emerald-400/50',
  },
];

interface SettingsPanelProps {
  gridSize: GridSize;
  onChangeGridSize: (size: GridSize) => void;
  colorCount: ColorCount;
  onChangeColorCount: (count: ColorCount) => void;
  /** P7: solo board topology (Classic square / Wheel) — solo only. */
  boardShape?: BoardShape;
  onChangeBoardShape?: (shape: BoardShape) => void;
  mode: GameMode;
  opponent: MultiplayerOpponent;
  onChangeOpponent: (opp: MultiplayerOpponent) => void;
  botDifficulty: BotDifficulty;
  onChangeBotDifficulty: (diff: BotDifficulty) => void;
  showTerritoryOverlay: boolean;
  onToggleTerritoryOverlay: () => void;
  /** P5.4: digit overlay on cells — color-blind aid (persisted, all modes). */
  showColorSymbols?: boolean;
  onToggleColorSymbols?: () => void;
  showHints: boolean;
  onToggleShowHints: () => void;
  onResetSeries: () => void;
  /** P4.8: synthesized sound effects with a persisted mute. */
  soundMuted?: boolean;
  onToggleSound?: () => void;
  /** Dev-only favicon util (P4.7) — undefined hides the row entirely. */
  onDownloadIcon?: () => void;
  onSetToEasiest?: () => void;
  activeThemeId: ThemeId;
  onOpenThemeModal: () => void;
  challengeType?: ChallengeType;
  onChangeChallengeType?: (type: ChallengeType) => void;
  /** Online only (P3.5): optional per-turn move timer, host configurable. */
  turnTimerSec?: 0 | 30 | 60;
  onChangeTurnTimerSec?: (sec: 0 | 30 | 60) => void;
  /** Settings is now an overlay sheet anchored to the header button. */
  onClose: () => void;
  /** How-to-Play moved off the header row into the sheet. */
  onOpenInfo?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  gridSize,
  onChangeGridSize,
  colorCount,
  onChangeColorCount,
  boardShape = 'classic',
  onChangeBoardShape,
  mode,
  opponent,
  botDifficulty,
  onChangeBotDifficulty,
  showTerritoryOverlay,
  onToggleTerritoryOverlay,
  showColorSymbols = false,
  onToggleColorSymbols,
  showHints,
  onToggleShowHints,
  onResetSeries,
  onDownloadIcon,
  onSetToEasiest,
  activeThemeId,
  onOpenThemeModal,
  challengeType = 'standard',
  onChangeChallengeType,
  turnTimerSec = 0,
  onChangeTurnTimerSec,
  soundMuted = false,
  onToggleSound,
  onClose,
  onOpenInfo,
}) => {
  const currentTheme = THEMES[activeThemeId] || THEMES.arcade;
  const panelRef = useModalA11y(true);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop — click to dismiss, never a tab stop (the sheet traps focus) */}
      <button
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm cursor-default"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Game Settings"
        tabIndex={-1}
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="relative w-full sm:w-[420px] max-h-[88dvh] sm:max-h-none sm:h-full bg-slate-900 border-t sm:border-t-0 sm:border-l border-slate-700/60 rounded-t-2xl sm:rounded-none shadow-2xl flex flex-col select-none outline-none"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-black text-white leading-none">Settings</h2>
            <p className="text-[10px] text-slate-400 mt-1">
              Board, palette, difficulty &amp; aids
            </p>
          </div>
          <div className="flex items-center gap-1">
            {onOpenInfo && (
              <button
                onClick={onOpenInfo}
                title="How to Play"
                aria-label="How to Play"
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close settings"
              aria-label="Close settings"
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3">
          {/* Quick Easiest Preset & Theme Bar */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-750 gap-2 flex-wrap">
            <div>
              <span className="text-xs font-bold text-white block">
                Difficulty & Aesthetics
              </span>
              <span className="text-[10px] text-slate-400">
                Default is always easiest setup
              </span>
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
                      ? 'bg-amber-500 text-slate-950 shadow-md border border-amber-400/50'
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

          {/* Online Only: Per-Turn Move Timer (host configurable, any time) */}
          {onChangeTurnTimerSec && (
            <div className="space-y-1.5 pb-2.5 border-b border-slate-750">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Turn Timer
                </label>
                <span className="text-[10px] text-amber-400 font-mono">
                  Running out forfeits the round
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([0, 30, 60] as const).map((sec) => (
                  <button
                    key={sec}
                    onClick={() => onChangeTurnTimerSec(sec)}
                    title={
                      sec === 0
                        ? 'No move timer — take as long as you like'
                        : `${sec} seconds per move`
                    }
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      turnTimerSec === sec
                        ? 'bg-amber-500 text-slate-950 shadow-md border border-amber-400/50'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                    }`}
                  >
                    <span>{sec === 0 ? 'Off' : `${sec}s`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* P7/P9: Board Shape — classic square or mandala wheel (both modes). */}
          {onChangeBoardShape && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Board Shape
                </label>
                <span className="text-[10px] text-indigo-400 font-mono">
                  {mode === 'solo'
                    ? 'floods from the center out'
                    : 'seeds both on the outer ring'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {BOARD_SHAPE_OPTIONS.map(({ id, label, title, Icon, activeClass }) => (
                  <button
                    key={id}
                    onClick={() => onChangeBoardShape(id)}
                    title={title}
                    aria-pressed={boardShape === id}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      boardShape === id
                        ? activeClass
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid Size Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Grid Size
              </label>
              <span className="text-[10px] text-indigo-400 font-mono">
                10x10 is easiest
              </span>
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
                    <span className="text-[7px] uppercase tracking-wider font-mono opacity-80">
                      Easy
                    </span>
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
              <span className="text-[10px] text-indigo-400 font-mono">
                4 Colors is easiest
              </span>
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
                    <span className="text-[7px] uppercase tracking-wider font-mono opacity-80">
                      Easy
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* P5.4: Color-blind aid — palette-digit overlay on every cell.
            Keep it visible in every mode; it is a device-level aid. */}
          {onToggleColorSymbols && (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onToggleColorSymbols}
                title="Show the palette number on each cell so colors stay tellable without hue vision (pairs with the Color Safe theme)"
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50"
              >
                <Shapes className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Symbols:{' '}
                  <strong className="text-white">
                    {showColorSymbols ? 'ON' : 'OFF'}
                  </strong>
                </span>
              </button>
              <span className="text-[10px] text-slate-400">
                Color-blind aid (1–8 = palette keys)
              </span>
            </div>
          )}

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
                    <span className="text-[10px] text-cyan-400 font-mono">
                      Easy is default
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['easy', 'medium', 'master'] as BotDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => onChangeBotDifficulty(diff)}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          botDifficulty === diff
                            ? 'bg-cyan-700 text-white shadow border border-cyan-400/40'
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
                    Glow:{' '}
                    <strong className="text-white">
                      {showTerritoryOverlay ? 'ON' : 'OFF'}
                    </strong>
                  </span>
                </button>

                {opponent !== 'online' && (
                  <button
                    onClick={onToggleShowHints}
                    className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50"
                    title="Show the hint button in local and bot matches (off by default; online play never shows hints)"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Hints:{' '}
                      <strong className="text-white">{showHints ? 'ON' : 'OFF'}</strong>
                    </span>
                  </button>
                )}

                {onToggleSound && (
                  <button
                    onClick={onToggleSound}
                    title="Synthesized move / win / loss sounds (P4.8)"
                    className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Sound:{' '}
                      <strong className="text-white">{soundMuted ? 'OFF' : 'ON'}</strong>
                    </span>
                  </button>
                )}

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

          {/* Download Icon utility — dev-only (P4.7) */}
          {onDownloadIcon && (
            <div className="pt-2 border-t border-slate-750">
              <button
                onClick={onDownloadIcon}
                className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700/50"
              >
                <Download className="w-3 h-3 text-indigo-400" />
                <span>Download Favicon PNG (512x512)</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
