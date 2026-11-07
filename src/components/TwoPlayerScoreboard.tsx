import React, { useState } from 'react';
import { User, Bot, Sparkles, Lightbulb, Globe, Copy, Check } from 'lucide-react';
import {
  TwoPlayerGameState,
  MultiplayerOpponent,
  SeriesScore,
  ActiveEmote,
  GameTheme,
  BoardShape,
} from '../types';
import { wheelCellCount } from '../utils/circleEngine';
import { THEMES } from '../utils/themes';
import { getPublicShareUrl } from '../utils/urlHelper';
import { ProgressiveTrack } from './ProgressiveTrack';

interface TwoPlayerScoreboardProps {
  gameState: TwoPlayerGameState;
  gridSize: number;
  /** P9: topology — a wheel's cell count is rings × sectors, not side². */
  shape?: BoardShape;
  opponent: MultiplayerOpponent;
  seriesScore: SeriesScore;
  isBotThinking?: boolean;
  onGetHint: () => void;
  hint: number | null;
  /** Hints are hidden entirely in online play, and off by default in local/bot. */
  showHintButton?: boolean;
  activeEmotes?: ActiveEmote[];
  theme?: GameTheme;
  p1Name?: string;
  p2Name?: string | null;
  myRole?: 1 | 2 | null;
  roomId?: string;
  p1Connected?: boolean;
  p2Connected?: boolean;
  onRequestReset?: () => void;
}

export const TwoPlayerScoreboard: React.FC<TwoPlayerScoreboardProps> = ({
  gameState,
  gridSize,
  shape = 'classic',
  opponent,
  seriesScore,
  isBotThinking = false,
  onGetHint,
  hint,
  showHintButton = true,
  activeEmotes = [],
  theme = THEMES.arcade,
  p1Name,
  p2Name,
  myRole,
  roomId,
  p1Connected = true,
  p2Connected = true,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const totalCells = shape === 'wheel' ? wheelCellCount(gridSize) : gridSize * gridSize;
  const p1Count = gameState.p1Cells.length;
  const p2Count = gameState.p2Cells.length;
  const neutralCount = Math.max(0, totalCells - p1Count - p2Count);

  const p1Percent = ((p1Count / totalCells) * 100).toFixed(1);
  const p2Percent = ((p2Count / totalCells) * 100).toFixed(1);
  const neutralPercent = ((neutralCount / totalCells) * 100).toFixed(1);

  const targetToWin = Math.floor(totalCells / 2) + 1;

  const isP1Turn = gameState.turn === 1;
  const isP2Turn = gameState.turn === 2;

  const displayName1 = p1Name || 'Player 1';
  const displayName2 =
    opponent === 'bot'
      ? 'AI Bot'
      : p2Name || (opponent === 'online' ? 'Player 2' : 'Player 2');

  const handleCopyCode = () => {
    if (!roomId) return;
    const url = getPublicShareUrl(roomId);
    navigator.clipboard.writeText(url);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isMyTurnOnline =
    opponent === 'online' ? (myRole === 1 ? isP1Turn : isP2Turn) : true;

  const activeColors = theme.colors;
  const p1ColorHex = activeColors[gameState.p1Color] || '#22D3EE';
  const p2ColorHex = activeColors[gameState.p2Color] || '#FB7185';

  const roundNum = gameState.roundNumber || 1;
  const firstTurn = gameState.firstTurnPlayer || 1;

  return (
    <div className="w-full max-w-xl mx-auto space-y-1 select-none">
      {/* If Progressive Challenge, show ladder */}
      {gameState.challengeType === 'progressive' && (
        <ProgressiveTrack
          currentStage={gameState.currentStage || 1}
          stageWins={gameState.stageWins || { 1: [], 2: [] }}
          p1Name={displayName1}
          p2Name={displayName2}
          shape={shape}
        />
      )}

      {/* Top Bar: Round & Alternating Turn Badge, Series Score & Tools */}
      <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 px-0.5">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-[10px] text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/30 font-bold">
            R{roundNum} • P{firstTurn} opened
          </span>
          <span className="text-cyan-400 font-bold">
            {displayName1.slice(0, 6)}: {seriesScore.p1}
          </span>
          <span className="text-slate-500">—</span>
          <span className="text-rose-400 font-bold">
            {displayName2.slice(0, 6)}: {seriesScore.p2}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {opponent === 'online' && roomId && (
            <button
              onClick={handleCopyCode}
              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white flex items-center gap-1 font-mono text-[10px] cursor-pointer"
              title="Copy room invite link"
            >
              <Globe className="w-2.5 h-2.5 text-emerald-400" />
              <span>{roomId}</span>
              {copiedCode ? (
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              ) : (
                <Copy className="w-2.5 h-2.5" />
              )}
            </button>
          )}

          <span className="text-[10px] text-slate-400 font-mono hidden xs:inline">
            Win: <strong className="text-slate-300">{targetToWin}</strong>
          </span>

          {showHintButton && (
            <button
              onClick={onGetHint}
              disabled={
                gameState.status !== 'playing' ||
                (opponent === 'bot' && isP2Turn) ||
                (opponent === 'online' && myRole !== gameState.turn)
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                hint !== null
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700/60 hover:text-white'
              }`}
              title="Hint best move"
            >
              <Lightbulb
                className={`w-3 h-3 ${hint !== null ? 'text-amber-400' : 'text-slate-400'}`}
              />
              <span>Hint</span>
            </button>
          )}
        </div>
      </div>

      {/* Versus Battle HUD Card */}
      <div className="bg-slate-900/90 border border-slate-750 rounded-xl px-2 py-1.5 shadow-md">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Player 1 Side */}
          <div
            className={`flex items-center gap-2 p-1 rounded-lg transition-all ${
              isP1Turn && gameState.status === 'playing'
                ? 'bg-cyan-950/40 ring-1 ring-cyan-500/40'
                : 'opacity-85'
            }`}
          >
            <div className="relative">
              {/* Floating Emote for P1 */}
              {activeEmotes
                .filter((e) => e.sender === 1)
                .map((e) => (
                  <div
                    key={e.id}
                    className="absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-bounce"
                  >
                    <div className="bg-slate-900/95 text-white border-2 border-cyan-400 rounded-full px-2 py-0.5 shadow-lg shadow-cyan-500/40 flex items-center gap-1">
                      <span className="text-lg leading-none">{e.emoji}</span>
                    </div>
                  </div>
                ))}

              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border-2 shadow-sm text-white transition-colors"
                style={{
                  backgroundColor: p1ColorHex,
                  borderColor: isP1Turn ? '#22D3EE' : 'rgba(255,255,255,0.2)',
                }}
              >
                <User className="w-3.5 h-3.5 drop-shadow" />
              </div>
              {myRole === 1 && opponent === 'online' && (
                <span className="absolute -bottom-1 -right-1 bg-cyan-500 text-slate-950 text-[7px] font-black px-1 rounded uppercase">
                  YOU
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-200 truncate block max-w-[70px] sm:max-w-[100px]">
                  {displayName1}
                </span>
                {opponent === 'online' && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      p1Connected ? 'bg-emerald-400' : 'bg-rose-500'
                    }`}
                  />
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-mono font-black text-white leading-none">
                  {p1Count}
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-semibold">
                  {p1Percent}%
                </span>
              </div>
            </div>
          </div>

          {/* Center: Turn Status Pill */}
          <div className="flex flex-col items-center justify-center px-1">
            {gameState.status === 'playing' ? (
              <div
                // P5.8: no opacity pulse here — mid-blink the pill drops
                // below AA; the turn chip above the palette carries the
                // animated cue instead. Dark ink on both pills stays ≥ 6:1.
                className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow flex items-center gap-1 whitespace-nowrap ${
                  isP1Turn
                    ? 'bg-cyan-500 text-slate-950'
                    : isBotThinking
                      ? 'bg-rose-400 text-slate-950 animate-bounce'
                      : 'bg-rose-500 text-slate-950'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>
                  {opponent === 'online'
                    ? isMyTurnOnline
                      ? 'Your Turn'
                      : 'Rival Turn'
                    : isP1Turn
                      ? 'P1 Turn'
                      : opponent === 'bot'
                        ? isBotThinking
                          ? 'Thinking'
                          : 'Bot Turn'
                        : 'P2 Turn'}
                </span>
              </div>
            ) : (
              <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                Round Over
              </span>
            )}
          </div>

          {/* Player 2 Side */}
          <div
            className={`flex items-center justify-end gap-2 p-1 rounded-lg transition-all ${
              isP2Turn && gameState.status === 'playing'
                ? 'bg-rose-950/40 ring-1 ring-rose-500/40'
                : 'opacity-85'
            }`}
          >
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1">
                {opponent === 'online' && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      p2Connected ? 'bg-emerald-400' : 'bg-rose-500'
                    }`}
                  />
                )}
                <span className="text-xs font-bold text-slate-200 truncate block max-w-[70px] sm:max-w-[100px]">
                  {displayName2}
                </span>
              </div>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-[10px] font-mono text-rose-400 font-semibold">
                  {p2Percent}%
                </span>
                <span className="text-base sm:text-lg font-mono font-black text-white leading-none">
                  {p2Count}
                </span>
              </div>
            </div>

            <div className="relative">
              {/* Floating Emote for P2 */}
              {activeEmotes
                .filter((e) => e.sender === 2)
                .map((e) => (
                  <div
                    key={e.id}
                    className="absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-bounce"
                  >
                    <div className="bg-slate-900/95 text-white border-2 border-rose-400 rounded-full px-2 py-0.5 shadow-lg shadow-rose-500/40 flex items-center gap-1">
                      <span className="text-lg leading-none">{e.emoji}</span>
                    </div>
                  </div>
                ))}

              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border-2 shadow-sm text-white transition-colors"
                style={{
                  backgroundColor: p2ColorHex,
                  borderColor: isP2Turn ? '#FB7185' : 'rgba(255,255,255,0.2)',
                }}
              >
                {opponent === 'bot' ? (
                  <Bot className="w-3.5 h-3.5 drop-shadow" />
                ) : (
                  <User className="w-3.5 h-3.5 drop-shadow" />
                )}
              </div>
              {myRole === 2 && opponent === 'online' && (
                <span className="absolute -bottom-1 -left-1 bg-rose-500 text-white text-[7px] font-black px-1 rounded uppercase">
                  YOU
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Domination Tug-of-War Bar */}
        <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex shadow-inner mt-1.5">
          {/* 50% line */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-white/80 z-10 shadow"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
            title="50% Majority Goal Line"
          />

          {/* P1 bar */}
          <div
            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-300 ease-out"
            style={{ width: `${p1Percent}%` }}
          />

          {/* Neutral center */}
          <div
            className="h-full bg-slate-750 transition-all duration-300 ease-out"
            style={{ width: `${neutralPercent}%` }}
          />

          {/* P2 bar */}
          <div
            className="h-full bg-gradient-to-l from-rose-600 to-rose-400 transition-all duration-300 ease-out ml-auto"
            style={{ width: `${p2Percent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
