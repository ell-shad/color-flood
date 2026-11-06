import React, { useEffect, useRef, useState } from 'react';
import {
  Settings2,
  RotateCcw,
  Users,
  User,
  Bot,
  Swords,
  Globe,
  BarChart3,
  Download,
  ChevronDown,
  Check,
} from 'lucide-react';
import { GameMode, MultiplayerOpponent } from '../types';

interface HeaderProps {
  mode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  opponent: MultiplayerOpponent;
  onChangeOpponent: (opp: MultiplayerOpponent) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  onToggleStats: () => void;
  onResetGame: () => void;
  /** P6.4: install affordance (only shown when the browser allows install). */
  canInstall: boolean;
  onInstall: () => void;
}

const OPPONENT_OPTIONS: {
  id: MultiplayerOpponent;
  label: string;
  short: string;
  Icon: typeof Globe;
  tone: string;
}[] = [
  { id: 'online', label: 'Online Match', short: 'Online', Icon: Globe, tone: 'text-emerald-300' },
  {
    id: 'local',
    label: 'Pass & Play',
    short: 'Pass & Play',
    Icon: Users,
    tone: 'text-rose-300',
  },
  { id: 'bot', label: 'vs AI Bot', short: 'vs AI', Icon: Bot, tone: 'text-cyan-300' },
];

/**
 * One compact bar: brand, mode tabs, opponent picker (multiplayer only) and
 * the three tools that matter mid-game (stats, settings, restart).
 *
 * The opponent picker used to be a full second header row, which is what made
 * the multiplayer top feel crowded; it is now a popover on the current rival.
 * Theme and How-to-Play moved into the settings sheet.
 */
export const Header: React.FC<HeaderProps> = ({
  mode,
  onSelectMode,
  opponent,
  onChangeOpponent,
  showSettings,
  onToggleSettings,
  onToggleStats,
  onResetGame,
  canInstall,
  onInstall,
}) => {
  const [opponentMenuOpen, setOpponentMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentOpponent =
    OPPONENT_OPTIONS.find((o) => o.id === opponent) ?? OPPONENT_OPTIONS[0];
  const CurrentIcon = currentOpponent.Icon;

  useEffect(() => {
    if (!opponentMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpponentMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpponentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [opponentMenuOpen]);

  return (
    <header className="w-full max-w-xl mx-auto px-2 sm:px-3 pt-1.5 shrink-0 select-none">
      <div className="flex items-center justify-between gap-1.5">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center shadow border border-slate-700/50 overflow-hidden">
            <svg viewBox="0 0 32 32" className="w-full h-full p-1" aria-hidden="true">
              <rect x="4" y="4" width="11" height="11" rx="2" fill="#FF595E" />
              <rect x="17" y="4" width="11" height="11" rx="2" fill="#FFCA3A" />
              <rect x="4" y="17" width="11" height="11" rx="2" fill="#8AC926" />
              <rect x="17" y="17" width="11" height="11" rx="2" fill="#1982C4" />
            </svg>
          </div>
          <span className="text-sm font-black tracking-tight text-white hidden min-[400px]:inline">
            Color Flood
          </span>
        </div>

        {/* Mode + opponent */}
        <div className="flex items-center gap-1 min-w-0">
          <div className="flex bg-slate-900/95 p-0.5 rounded-lg border border-slate-800 shadow-inner">
            <button
              onClick={() => onSelectMode('solo')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
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
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                mode === 'multiplayer'
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Swords className="w-3 h-3" />
              <span>2P</span>
            </button>
          </div>

          {mode === 'multiplayer' && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpponentMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={opponentMenuOpen}
                aria-label={`Opponent: ${currentOpponent.label}`}
                title="Choose opponent"
                className="flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-lg bg-slate-900/95 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
              >
                <CurrentIcon className={`w-3 h-3 ${currentOpponent.tone}`} />
                <span className="hidden min-[400px]:inline">{currentOpponent.short}</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-500 transition-transform ${
                    opponentMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {opponentMenuOpen && (
                <div
                  role="menu"
                  aria-label="Opponent"
                  className="absolute right-0 top-full mt-1 z-50 w-44 p-1 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl"
                >
                  {OPPONENT_OPTIONS.map(({ id, label, Icon, tone }) => {
                    const selected = id === opponent;
                    return (
                      <button
                        key={id}
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          onChangeOpponent(id);
                          setOpponentMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          selected
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${tone}`} />
                        <span className="flex-1 text-left">{label}</span>
                        {selected && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tools */}
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
          {canInstall && (
            <button
              onClick={onInstall}
              className="p-1.5 rounded-lg bg-slate-850/80 border border-slate-750 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
              title="Install app"
              aria-label="Install app"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
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
    </header>
  );
};
