import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  ChevronRight,
  RotateCcw,
  Swords,
  Crown,
  User,
  Bot,
  LogOut,
  Check,
  X,
  Clock,
  Sparkles,
  Link as LinkIcon,
  Play,
  Eye,
} from 'lucide-react';
import { GameMode, MultiplayerOpponent, SeriesScore, ChallengeType } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { copyText } from '../utils/clipboard';

interface GameOverModalProps {
  mode: GameMode;
  soloStatus?: 'playing' | 'won' | 'lost';
  soloMoves?: number;
  multiplayerStatus?: 'playing' | 'p1_won' | 'p2_won' | 'draw';
  p1Count?: number;
  p2Count?: number;
  totalCells?: number;
  opponent?: MultiplayerOpponent;
  seriesScore?: SeriesScore;
  challengeType?: ChallengeType;
  currentStage?: number;
  onPlayAgain: () => void;
  onAcceptRematch?: () => void;
  onDeclineRematch?: () => void;
  onResetSeries?: () => void;
  p1Name?: string;
  p2Name?: string | null;
  myRole?: 1 | 2 | null;
  rematchRequestedBy?: number | null;
  onLeaveRoom?: () => void;
  /** P6.6: this viewer holds a receive-only spectator seat (guidance only). */
  spectating?: boolean;
  /** P6.6: true for role 1 — hosts start the next round without consent. */
  isHost?: boolean;
  /** P6.6: host-instant rematch (ignored unless isHost). */
  onHostRematch?: () => void;
  /** P6.1: Wordle-style share sheet; non-null only for finished daily rounds. */
  dailyShareText?: string | null;
  /** P6.3: opens the replay viewer for the finished solo game. */
  onWatchReplay?: () => void;
  /** P6.3: link that rebuilds this exact board for another player. */
  shareBoardLink?: string | null;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  mode,
  soloStatus = 'playing',
  soloMoves = 0,
  multiplayerStatus = 'playing',
  p1Count = 0,
  p2Count = 0,
  totalCells = 100,
  opponent = 'local',
  seriesScore,
  challengeType = 'standard',
  currentStage = 1,
  onPlayAgain,
  onAcceptRematch,
  onDeclineRematch,
  onResetSeries,
  p1Name,
  p2Name,
  myRole,
  rematchRequestedBy,
  onLeaveRoom,
  spectating = false,
  isHost = false,
  onHostRematch,
  dailyShareText = null,
  onWatchReplay,
  shareBoardLink = null,
}) => {
  const isSoloActive = mode === 'solo' && soloStatus !== 'playing';
  const isMultiplayerActive = mode === 'multiplayer' && multiplayerStatus !== 'playing';
  const isOpen = isSoloActive || isMultiplayerActive;
  // P6.1: transient share feedback (copied → back to "Share result").
  const [shareCopied, setShareCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  // P6.3: transient feedback for the board-link copy.
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);
  const handleCopyShare = async () => {
    if (!dailyShareText) return;
    setShareFailed(false);
    const ok = await copyText(dailyShareText);
    if (!ok) {
      setShareFailed(true);
      setTimeout(() => setShareFailed(false), 2000);
      return;
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };
  // P5.3: dialog semantics, focus trap, focus restore (both variants).
  const panelRef = useModalA11y(isOpen);

  if (!isSoloActive && !isMultiplayerActive) {
    return null;
  }

  // Solo details
  if (mode === 'solo') {
    const isWon = soloStatus === 'won';
    return (
      <AnimatePresence>
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={isWon ? 'Solo victory' : 'Game over'}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute inset-0 z-20 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md rounded-2xl select-none outline-none"
        >
          <div className="text-center space-y-4 max-w-xs w-full">
            <div
              className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
                isWon
                  ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-400'
                  : 'bg-rose-600/30 border border-rose-500/50 text-rose-400'
              }`}
            >
              <Trophy className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2
                className={`text-2xl font-black italic tracking-tighter ${
                  isWon ? 'text-indigo-400' : 'text-rose-500'
                }`}
              >
                {isWon ? 'VICTORY!' : 'GAME OVER'}
              </h2>
              <p className="text-slate-300 text-xs leading-relaxed">
                {isWon
                  ? `Incredible! You flooded the entire grid in ${soloMoves} moves.`
                  : "You reached the move limit before flooding the board. Don't give up, try again!"}
              </p>
            </div>

            <button
              onClick={onPlayAgain}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <span>Play Again</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {onWatchReplay && (
              <button
                onClick={onWatchReplay}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Watch replay</span>
              </button>
            )}

            {dailyShareText !== null && (
              <button
                onClick={handleCopyShare}
                className={`w-full py-2 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs ${
                  shareCopied
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {shareCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copied to clipboard!</span>
                  </>
                ) : shareFailed ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy failed — try again</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Share daily result</span>
                  </>
                )}
              </button>
            )}
            {shareBoardLink !== null && (
              <button
                onClick={async () => {
                  const ok = await copyText(shareBoardLink);
                  if (!ok) {
                    setLinkCopyFailed(true);
                    setTimeout(() => setLinkCopyFailed(false), 2000);
                    return;
                  }
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className={`w-full py-2 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-xs ${
                  linkCopied
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    : linkCopyFailed
                      ? 'bg-slate-800 hover:bg-slate-700 text-rose-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {linkCopied ? (
                  <>
                    <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Board link copied!</span>
                  </>
                ) : linkCopyFailed ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy failed — try again</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy board link</span>
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Multiplayer details
  const p1Percent = ((p1Count / totalCells) * 100).toFixed(1);
  const p2Percent = ((p2Count / totalCells) * 100).toFixed(1);
  const isP1Winner = multiplayerStatus === 'p1_won';
  const isP2Winner = multiplayerStatus === 'p2_won';
  const isDraw = multiplayerStatus === 'draw';

  const name1 = p1Name || 'Player 1';
  const name2 =
    opponent === 'bot'
      ? 'AI Bot'
      : p2Name || (opponent === 'online' ? 'Player 2' : 'Player 2');

  let winnerTitle = 'TIED BATTLE!';
  if (isP1Winner) {
    if (opponent === 'online' && myRole === 1) winnerTitle = 'YOU WON!';
    else if (opponent === 'online' && myRole === 2)
      winnerTitle = `${name1.toUpperCase()} WON!`;
    else winnerTitle = `${name1.toUpperCase()} WINS!`;
  } else if (isP2Winner) {
    if (opponent === 'online' && myRole === 2) winnerTitle = 'YOU WON!';
    else if (opponent === 'online' && myRole === 1)
      winnerTitle = `${name2.toUpperCase()} WON!`;
    else winnerTitle = `${name2.toUpperCase()} WINS!`;
  }

  const winnerColorClass = isP1Winner
    ? 'text-cyan-400'
    : isP2Winner
      ? 'text-rose-400'
      : 'text-amber-400';

  const otherWantsRematch = rematchRequestedBy !== null && rematchRequestedBy !== myRole;
  const iRequestedRematch = rematchRequestedBy === myRole;

  const isProgressive = challengeType === 'progressive';
  const nextStageNum = Math.min(5, currentStage + 1);

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          isDraw
            ? 'Round drawn'
            : isP1Winner || isP2Winner
              ? 'Round victory'
              : 'Game over'
        }
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="absolute inset-0 z-20 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md rounded-2xl select-none outline-none"
      >
        <div className="text-center space-y-3 max-w-sm w-full">
          <div className="w-11 h-11 rounded-2xl mx-auto flex items-center justify-center shadow-lg bg-slate-900 border border-slate-700">
            {isDraw ? (
              <Swords className="w-6 h-6 text-amber-400" />
            ) : (
              <Crown className={`w-6 h-6 ${winnerColorClass}`} />
            )}
          </div>

          <div className="space-y-0.5">
            <h2
              className={`text-xl sm:text-2xl font-black italic tracking-tighter ${winnerColorClass}`}
            >
              {winnerTitle}
            </h2>
            <p className="text-slate-400 text-[11px]">
              {isProgressive ? (
                <span className="text-amber-300 font-semibold flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>
                    Stage {currentStage} complete! Next up: Stage {nextStageNum}
                  </span>
                </span>
              ) : isDraw ? (
                'Both rivals conquered the exact same number of cells!'
              ) : (
                `${isP1Winner ? name1 : name2} claimed majority territory!`
              )}
            </p>
          </div>

          {/* Territory Result Comparison Cards */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div
              className={`p-2 sm:p-2.5 rounded-xl border ${
                isP1Winner
                  ? 'bg-cyan-950/50 border-cyan-500/60 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 opacity-80'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 mb-0.5">
                <User className="w-3 h-3 text-cyan-400" />
                <span className="truncate">{name1}</span>
              </div>
              <p className="text-lg font-mono font-black text-cyan-400 leading-none">
                {p1Count}{' '}
                <span className="text-[10px] font-normal text-slate-400">cells</span>
              </p>
              <span className="text-[10px] font-mono text-slate-400">
                {p1Percent}% territory
              </span>
            </div>

            <div
              className={`p-2 sm:p-2.5 rounded-xl border ${
                isP2Winner
                  ? 'bg-rose-950/50 border-rose-500/60 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 opacity-80'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 mb-0.5">
                {opponent === 'bot' ? (
                  <Bot className="w-3 h-3 text-rose-400" />
                ) : (
                  <User className="w-3 h-3 text-rose-400" />
                )}
                <span className="truncate">{name2}</span>
              </div>
              <p className="text-lg font-mono font-black text-rose-400 leading-none">
                {p2Count}{' '}
                <span className="text-[10px] font-normal text-slate-400">cells</span>
              </p>
              <span className="text-[10px] font-mono text-slate-400">
                {p2Percent}% territory
              </span>
            </div>
          </div>

          {/* Series Standings */}
          {seriesScore && (
            <div className="bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
              <span className="text-slate-400">Series Score:</span>
              <span className="font-mono font-bold">
                {name1.slice(0, 8)}:{' '}
                <span className="text-cyan-400">{seriesScore.p1}</span> —{' '}
                {name2.slice(0, 8)}:{' '}
                <span className="text-rose-400">{seriesScore.p2}</span>
              </span>
            </div>
          )}

          {/* Action Buttons with Approval Flow */}
          <div className="space-y-1.5 pt-1">
            {opponent === 'online' && spectating ? (
              <div className="bg-indigo-950/60 border border-indigo-500/40 p-2.5 rounded-xl text-xs text-indigo-200 flex items-start justify-center gap-2">
                <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  You're watching this match. The players decide when the next round
                  begins.
                </span>
              </div>
            ) : opponent === 'online' && otherWantsRematch ? (
              <div className="space-y-1.5">
                <p className="text-xs text-amber-300 font-semibold animate-pulse">
                  Opponent wants to play next round!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onDeclineRematch}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={onAcceptRematch || onPlayAgain}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept Rematch</span>
                  </button>
                </div>
              </div>
            ) : opponent === 'online' && iRequestedRematch ? (
              <div className="bg-indigo-950/60 border border-indigo-500/40 p-2.5 rounded-xl text-xs text-indigo-200 flex items-center justify-center gap-2">
                <Clock className="w-3.5 h-3.5 animate-spin-slow text-indigo-400" />
                <span>Rematch proposed! Waiting for opponent approval...</span>
              </div>
            ) : opponent === 'online' && isHost && onHostRematch ? (
              <button
                onClick={onHostRematch}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm active:scale-95"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isProgressive ? `Start Stage ${nextStageNum} Now` : 'Rematch Now'}
                </span>
              </button>
            ) : (
              <button
                onClick={onPlayAgain}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {isProgressive
                    ? `Advance to Stage ${nextStageNum}`
                    : opponent === 'online'
                      ? 'Request Rematch (Alternating Turns)'
                      : 'Play Again'}
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {opponent === 'online' && onLeaveRoom && (
              <button
                onClick={onLeaveRoom}
                className="w-full py-1.5 px-3 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-750"
              >
                <LogOut className="w-3 h-3" />
                <span>Leave Room</span>
              </button>
            )}

            {opponent !== 'online' && onResetSeries && (
              <button
                onClick={onResetSeries}
                className="w-full py-1.5 px-3 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-750"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Series Score</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
