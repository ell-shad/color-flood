import React from 'react';
import {
  Settings2,
  RotateCcw,
  Info,
  Users,
  User,
  Bot,
  Swords,
  Globe,
  Palette,
  BarChart3,
} from 'lucide-react';
import { GameMode, MultiplayerOpponent } from '../types';

interface HeaderProps {
  mode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  opponent: MultiplayerOpponent;
  onChangeOpponent: (opp: MultiplayerOpponent) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  onToggleInfo: () => void;
  onToggleThemes: () => void;
  onToggleStats: () => void;
  onResetGame: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onSelectMode,
  opponent,
  onChangeOpponent,
  showSettings,
  onToggleSettings,
  onToggleInfo,
  onToggleThemes,
  onToggleStats,
  onResetGame,
}) => {
  return (
    <header className="w-full max-w-lg mx-auto pt-2 px-2.5 sm:px-3 space-y-1.5 shrink-0 select-none">
      {/* Top compact bar: Brand, Mode Switcher, and Tools */}
      <div className="flex items-center justify-between gap-1.5">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-800 rounded-lg flex items-center justify-center shadow border border-slate-700/50 overflow-hidden relative">
            <svg viewBox="0 0 32 32" className="w-full h-full p-1" aria-hidden="true">
              <rect x="4" y="4" width="11" height="11" rx="2" fill="#FF595E" />
              <rect x="17" y="4" width="11" height="11" rx="2" fill="#FFCA3A" />
              <rect x="4" y="17" width="11" height="11" rx="2" fill="#8AC926" />
              <rect x="17" y="17" width="11" height="11" rx="2" fill="#1982C4" />
            </svg>
          </div>
          <span className="text-sm sm:text-base font-black tracking-tight text-white hidden xs:inline">
            Color Flood
          </span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex bg-slate-900/95 p-0.5 rounded-lg border border-slate-800 shadow-inner">
          <button
            onClick={() => onSelectMode('solo')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              mode === 'solo'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3 h-3" />
            <span>Solo</span>
          </button>
          <button
            onClick={() => onSelectMode('multiplayer')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              mode === 'multiplayer'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3 h-3" />
            <span>2P Battle</span>
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleStats}
            className="p-1.5 rounded-lg bg-slate-850/80 border border-slate-750 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
            title="Your Stats"
            aria-label="Your Stats"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleThemes}
            className="p-1.5 rounded-lg bg-slate-850/80 border border-slate-750 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
            title="Color Themes & Palettes"
            aria-label="Color Themes"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleInfo}
            className="p-1.5 rounded-lg bg-slate-850/80 border border-slate-750 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="How to Play"
            aria-label="How to Play"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleSettings}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showSettings
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-850/80 border-slate-750 text-slate-400 hover:text-white'
            }`}
            title="Game Settings"
            aria-label="Game Settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetGame}
            className="p-1.5 rounded-lg bg-slate-850/80 border border-slate-750 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Reset Game"
            aria-label="Reset Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* When in Multiplayer: Single compact rival selector bar */}
      {mode === 'multiplayer' && (
        <div className="flex items-center justify-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs w-full">
          <button
            onClick={() => onChangeOpponent('online')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-[11px] ${
              opponent === 'online'
                ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3 h-3 text-emerald-400" />
            <span>Online</span>
          </button>
          <button
            onClick={() => onChangeOpponent('local')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-[11px] ${
              opponent === 'local'
                ? 'bg-slate-800 text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3 h-3 text-rose-400" />
            <span>Pass & Play</span>
          </button>
          <button
            onClick={() => onChangeOpponent('bot')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-[11px] ${
              opponent === 'bot'
                ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3 h-3 text-cyan-400" />
            <span>vs AI Bot</span>
          </button>
        </div>
      )}
    </header>
  );
};
