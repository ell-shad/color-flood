/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Smile, Sparkles } from 'lucide-react';
import { MultiplayerOpponent, ActiveEmote } from '../types';

export const EMOJI_OPTIONS = ['🔥', '😎', '😮', '😂', '👏', '🤔', '💀', '💥', '😡', '😭'];

interface MultiplayerEmotesProps {
  opponent: MultiplayerOpponent;
  myRole?: 1 | 2 | null;
  activeTurn: 1 | 2;
  activeEmotes: ActiveEmote[];
  onSendEmote: (sender: 1 | 2, emoji: string) => void;
  p1Name?: string;
  p2Name?: string | null;
  disabled?: boolean;
}

export const MultiplayerEmotes: React.FC<MultiplayerEmotesProps> = ({
  opponent,
  myRole,
  activeTurn,
  onSendEmote,
  p1Name,
  p2Name,
  disabled = false,
}) => {
  const [localSender, setLocalSender] = useState<1 | 2>(1);

  // Determine which player is actively pressing
  const currentSender: 1 | 2 =
    opponent === 'online'
      ? (myRole || 1)
      : opponent === 'bot'
      ? 1
      : localSender;

  const handleEmoteClick = (emoji: string) => {
    if (disabled) return;
    onSendEmote(currentSender, emoji);
  };

  const displayName1 = p1Name || 'Player 1';
  const displayName2 =
    opponent === 'bot'
      ? 'AI Bot'
      : p2Name || (opponent === 'online' ? 'Player 2' : 'Player 2');

  return (
    <div className="w-full max-w-xl mx-auto my-1.5 px-1">
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl px-2.5 py-1.5 shadow-md flex items-center justify-between gap-1.5 backdrop-blur-sm">
        {/* Left Label or Local Switcher */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
            <Smile className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline text-slate-300">Emotes:</span>
          </div>

          {opponent === 'local' && (
            <div className="flex items-center bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setLocalSender(1)}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  localSender === 1
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                P1
              </button>
              <button
                type="button"
                onClick={() => setLocalSender(2)}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  localSender === 2
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                P2
              </button>
            </div>
          )}

          {opponent === 'online' && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
              {myRole === 1 ? displayName1 : displayName2}
            </span>
          )}

          {opponent === 'bot' && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700/50">
              You
            </span>
          )}
        </div>

        {/* Emote Button Strip */}
        <div className="flex items-center justify-end gap-1 sm:gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmoteClick(emoji)}
              disabled={disabled}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-base sm:text-lg transition-transform active:scale-90 hover:scale-115 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                currentSender === 1
                  ? 'bg-slate-800/80 hover:bg-cyan-950/60 hover:ring-1 hover:ring-cyan-400/50 border border-slate-700/40'
                  : 'bg-slate-800/80 hover:bg-rose-950/60 hover:ring-1 hover:ring-rose-400/50 border border-slate-700/40'
              }`}
              title={`Send ${emoji}`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Component for rendering floating bubbles attached to player cards
interface FloatingEmotesOverlayProps {
  activeEmotes: ActiveEmote[];
}

export const FloatingEmotesOverlay: React.FC<FloatingEmotesOverlayProps> = ({
  activeEmotes,
}) => {
  if (activeEmotes.length === 0) return null;

  return (
    <>
      {activeEmotes.map((item) => {
        const isP1 = item.sender === 1;
        return (
          <div
            key={item.id}
            className={`absolute pointer-events-none z-30 transition-all duration-300 ${
              isP1 ? '-top-10 left-1 sm:left-2' : '-top-10 right-1 sm:right-2'
            }`}
          >
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full shadow-2xl border backdrop-blur-md animate-bounce ${
                isP1
                  ? 'bg-cyan-950/90 text-cyan-200 border-cyan-400/80 shadow-cyan-500/20'
                  : 'bg-rose-950/90 text-rose-200 border-rose-400/80 shadow-rose-500/20'
              }`}
            >
              <span className="text-xl sm:text-2xl filter drop-shadow">{item.emoji}</span>
              <Sparkles
                className={`w-3 h-3 ${isP1 ? 'text-cyan-400' : 'text-rose-400'}`}
              />
            </div>
          </div>
        );
      })}
    </>
  );
};
