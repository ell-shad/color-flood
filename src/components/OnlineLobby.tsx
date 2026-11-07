import React, { useState } from 'react';
import {
  Globe,
  PlusCircle,
  LogIn,
  Copy,
  Check,
  Share2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Wifi,
  Users,
  Trophy,
  Eye,
  Circle,
  Square,
} from 'lucide-react';
import { OnlineRoomState, ChallengeType, BoardShape } from '../types';
import { getPublicShareUrl } from '../utils/urlHelper';
import { loadStringOr, saveString } from '../utils/storage';

interface OnlineLobbyProps {
  roomState: OnlineRoomState | null;
  myRole: 1 | 2 | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage: string | null;
  systemMessage: string | null;
  gridSize: number;
  colorCount: number;
  onCreateRoom: (
    playerName: string,
    gridSize: number,
    colorCount: number,
    challengeType: ChallengeType,
    shape: BoardShape,
  ) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  /** P6.6: watch a room at a receive-only seat (even when full). */
  onSpectateRoom: (roomId: string, playerName: string) => void;
  onLeaveRoom: () => void;
  onClearError: () => void;
  /** P6.6: protocol-level code of the last error (room_full offers watching). */
  errorCode?: string | null;
  /** P6.6: live spectator head count (shown on the waiting card). */
  spectatorCount?: number;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  roomState,
  connectionStatus,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onSpectateRoom,
  onLeaveRoom,
  onClearError,
  errorCode = null,
  spectatorCount = 0,
}) => {
  const [playerName, setPlayerName] = useState(() => {
    return loadStringOr('player-name', 'Player 1', 'color-flood-player-name');
  });

  const [inputRoomCode, setInputRoomCode] = useState<string>(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '',
  );
  // Check URL query params for ?room=CODE — read once at mount via lazy
  // initializers (no setState-in-effect cascade; values never change before
  // the user types or clears them).
  const [invitedFromUrl, setInvitedFromUrl] = useState<boolean>(
    () => !!new URLSearchParams(window.location.search).get('room'),
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedChallengeType, setSelectedChallengeType] =
    useState<ChallengeType>('progressive');
  const [customGridSize, setCustomGridSize] = useState<number>(10);
  const [customColorCount, setCustomColorCount] = useState<number>(4);
  // P9: board topology for the hosted room (applies to both tracks).
  const [selectedShape, setSelectedShape] = useState<BoardShape>('classic');

  const clearUrlParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.pathname);
    setInvitedFromUrl(false);
    setInputRoomCode('');
  };

  const handleCreateRoom = (name: string) => {
    clearUrlParam();
    onCreateRoom(
      name,
      selectedChallengeType === 'progressive' ? 10 : customGridSize,
      selectedChallengeType === 'progressive' ? 4 : customColorCount,
      selectedChallengeType,
      selectedShape,
    );
  };

  const handleNameChange = (name: string) => {
    setPlayerName(name);
    saveString('player-name', name.slice(0, 20));
  };

  const handleCopyCode = () => {
    if (!roomState?.roomId) return;
    navigator.clipboard.writeText(roomState.roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!roomState?.roomId) return;
    const url = getPublicShareUrl(roomState.roomId);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // If in a room and waiting for player 2:
  if (roomState && roomState.status === 'waiting') {
    return (
      <div className="w-full max-w-sm sm:max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-center my-2 sm:my-3 select-none">
        <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
          <Globe className="w-5 h-5 animate-pulse" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Online Room Ready!
          </h2>
          <p className="text-xs text-slate-400">
            Share this room code or public invite link with your friend to connect.
          </p>
        </div>

        {/* Big Room Code Box */}
        <div className="bg-slate-950 p-3.5 sm:p-4 rounded-xl border border-slate-800 space-y-2.5">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Room Code
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl sm:text-4xl font-mono font-black tracking-widest text-cyan-400 select-all">
              {roomState.roomId}
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCopyCode}
              className="flex-1 py-2 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="flex-1 py-2 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink ? 'Link Copied!' : 'Share Link'}</span>
            </button>
          </div>
        </div>

        {/* Radar animation waiting */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-850/60 py-2 px-3 rounded-xl border border-slate-750">
          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>Waiting for Player 2 to join...</span>
        </div>

        {/* P6.6: live spectator head count (updates as seats come and go). */}
        {spectatorCount > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-indigo-300 bg-indigo-950/40 py-1.5 px-3 rounded-xl border border-indigo-500/25">
            <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              {spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'}{' '}
              watching
            </span>
          </div>
        )}

        {/* Config Summary */}
        <div className="space-y-1">
          <div className="text-[11px] text-slate-400 flex justify-center gap-3">
            <span>
              Type:{' '}
              <strong className="text-amber-300">
                {roomState.challengeType === 'progressive'
                  ? 'Progressive Track'
                  : 'Standard'}
              </strong>
            </span>
            <span>
              Grid: <strong className="text-slate-200">{roomState.gridSize}²</strong>
            </span>
            <span>
              Colors: <strong className="text-slate-200">{roomState.colorCount}</strong>
            </span>
          </div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-400 font-mono">
            <Wifi className="w-3 h-3" />
            <span>P2P Direct Relay Active</span>
          </div>
        </div>

        <button
          onClick={onLeaveRoom}
          className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5 mx-auto cursor-pointer pt-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Cancel & Leave Room</span>
        </button>
      </div>
    );
  }

  // Lobby Menu: Create or Join
  return (
    <div className="w-full max-w-sm sm:max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-2 select-none">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 mb-1">
          <Globe className="w-5 h-5" />
        </div>
        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
          Online 2-Player Match
        </h2>
        <p className="text-[11px] text-slate-400">
          Battle a friend in real-time on a track from easy to difficult!
        </p>
      </div>

      {/* URL Invitation Alert if arrived via shared link */}
      {invitedFromUrl && inputRoomCode && (
        <div className="bg-indigo-950/60 border border-indigo-500/50 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs text-indigo-200 shadow-md">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Invited to:{' '}
              <strong className="font-mono text-white text-sm">{inputRoomCode}</strong>
            </span>
          </div>
          <button
            onClick={() => onJoinRoom(inputRoomCode, playerName)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow"
          >
            Join Now
          </button>
        </div>
      )}

      {/* Error Notices */}
      {errorMessage &&
      (errorMessage.toLowerCase().includes('full') || errorMessage.includes('2/2')) ? (
        <div className="bg-amber-950/60 border border-amber-500/50 p-3 rounded-xl space-y-2 text-left shadow-lg">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-amber-200">
                  Room is Full (2/2 Players)
                </span>
              </div>
              <p className="text-[11px] text-amber-300/90 mt-0.5 leading-relaxed">
                This room already has 2 players. Online matches are strictly 2 players
                only.
              </p>
            </div>
            <button
              onClick={() => {
                onClearError();
                clearUrlParam();
              }}
              className="text-amber-400 hover:text-white font-bold text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      ) : errorMessage ? (
        <div className="bg-rose-950/60 border border-rose-500/50 p-2.5 rounded-xl flex items-start gap-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{errorMessage}</p>
          </div>
          <button
            onClick={onClearError}
            className="text-rose-400 hover:text-white font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Player Nickname */}
      <div className="space-y-1 text-left">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Your Nickname
        </label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => handleNameChange(e.target.value)}
          maxLength={15}
          placeholder="Enter nickname"
          className="w-full bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
      </div>

      {/* Host Option with Challenge Type Selection */}
      <div className="bg-slate-950/80 p-3 sm:p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Host New Match</span>
          </span>
          <span className="text-[10px] text-indigo-300 font-mono">
            Opponents take turns
          </span>
        </div>

        {/* Challenge Type Selector */}
        <div className="space-y-1.5 text-left">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
            Challenge Track
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedChallengeType('progressive')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                selectedChallengeType === 'progressive'
                  ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500/40 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
                <Trophy className="w-3 h-3 text-amber-400" />
                <span>Progressive Track</span>
              </div>
              <span className="text-[9px] text-slate-400 leading-tight mt-1">
                Ladder: 10x10 easy → 18x18 master
              </span>
            </button>

            <button
              onClick={() => setSelectedChallengeType('standard')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                selectedChallengeType === 'standard'
                  ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500/40 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-300">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Custom Match</span>
              </div>
              <span className="text-[9px] text-slate-400 leading-tight mt-1">
                Fixed difficulty round-by-round
              </span>
            </button>
          </div>
        </div>

        {/* P9: Board shape — polar wheel or classic square. */}
        <div className="space-y-1.5 text-left">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
            Board Shape
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedShape('classic')}
              aria-pressed={selectedShape === 'classic'}
              className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedShape === 'classic'
                  ? 'bg-indigo-950/70 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Square className="w-3 h-3" />
              Classic
            </button>
            <button
              onClick={() => setSelectedShape('wheel')}
              aria-pressed={selectedShape === 'wheel'}
              className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedShape === 'wheel'
                  ? 'bg-fuchsia-950/70 border-fuchsia-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Circle className="w-3 h-3" />
              Wheel
            </button>
          </div>
          <p className="text-[9px] text-slate-500 leading-tight">
            {selectedShape === 'wheel'
              ? 'Both players start on the outer ring and flood inward.'
              : 'Both players start in opposite corners.'}
          </p>
        </div>

        {/* If Custom Match, allow choosing difficulty */}
        {selectedChallengeType === 'standard' && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                Grid Size
              </label>
              <select
                value={customGridSize}
                onChange={(e) => setCustomGridSize(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-750 text-xs text-white rounded-lg p-1.5 focus:outline-none"
              >
                <option value={10}>10x10 (Easiest)</option>
                <option value={12}>12x12</option>
                <option value={14}>14x14</option>
                <option value={16}>16x16</option>
                <option value={18}>18x18</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                Colors
              </label>
              <select
                value={customColorCount}
                onChange={(e) => setCustomColorCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-750 text-xs text-white rounded-lg p-1.5 focus:outline-none"
              >
                <option value={4}>4 Colors (Easiest)</option>
                <option value={5}>5 Colors</option>
                <option value={6}>6 Colors</option>
                <option value={7}>7 Colors</option>
                <option value={8}>8 Colors</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={() => handleCreateRoom(playerName)}
          disabled={connectionStatus === 'connecting'}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {connectionStatus === 'connecting' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <PlusCircle className="w-3.5 h-3.5" />
          )}
          <span>Create Match Room</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative flex py-0.5 items-center">
        <div className="flex-grow border-t border-slate-800"></div>
        <span className="flex-shrink mx-2 text-[9px] text-slate-400 uppercase tracking-widest font-bold">
          Or Join Code
        </span>
        <div className="flex-grow border-t border-slate-800"></div>
      </div>

      {/* Join Room by Code */}
      <div className="bg-slate-950/80 p-3 sm:p-3.5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <LogIn className="w-3.5 h-3.5 text-rose-400" />
          <span>Join with Room Code</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={inputRoomCode}
            onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={8}
            className="flex-1 bg-slate-900 border border-slate-750 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-mono tracking-widest uppercase text-white focus:outline-none focus:border-rose-500"
          />
          <button
            onClick={() => onJoinRoom(inputRoomCode, playerName)}
            disabled={!inputRoomCode.trim() || connectionStatus === 'connecting'}
            className="py-1.5 px-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-rose-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
          >
            {connectionStatus === 'connecting' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogIn className="w-3.5 h-3.5" />
            )}
            <span>Join</span>
          </button>
        </div>
        {/* P6.6: watch without a player seat — the default way in when the
            room is actually full, and a shortcut for lurkers any other time. */}
        <button
          onClick={() => onSpectateRoom(inputRoomCode, playerName)}
          disabled={!inputRoomCode.trim() || connectionStatus === 'connecting'}
          className="w-full py-1.5 px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-750 text-slate-300 hover:text-indigo-300 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>Watch as Spectator</span>
        </button>
        {errorCode === 'room_full' && errorMessage && (
          <button
            onClick={() => onSpectateRoom(inputRoomCode, playerName)}
            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Room full — Watch instead</span>
          </button>
        )}
      </div>
    </div>
  );
};
