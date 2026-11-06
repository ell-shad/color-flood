import React, { useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Github, Linkedin, Info, Flame } from 'lucide-react';

import { useGameSession } from './hooks/useGameSession';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { loadBool, saveString } from './utils/storage';

import { Header } from './components/Header';
import { SoloScoreboard } from './components/SoloScoreboard';
import { TwoPlayerScoreboard } from './components/TwoPlayerScoreboard';
import { GameGrid } from './components/GameGrid';
import { ColorPalette } from './components/ColorPalette';
import { GameOverModal } from './components/GameOverModal';
import { SettingsPanel } from './components/SettingsPanel';
import { OnlineLobby } from './components/OnlineLobby';
import { MultiplayerEmotes } from './components/MultiplayerEmotes';
import { ResetApprovalModal } from './components/ResetApprovalModal';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { FirstRunTutorial } from './components/FirstRunTutorial';
import { DailyChallengeModal } from './components/DailyChallengeModal';
import { StatsModal } from './components/StatsModal';

/**
 * P4.1: App is now a thin render shell.
 *
 * All game state, engines, effects and persistence live behind the
 * `useGameSession()` view model (P4.2–P4.4, P4.5, P4.8). Only presentation
 * state (modals/settings drawer) and the dev-only favicon utility remain.
 */
export default function App() {
  const session = useGameSession();

  // P5.7: first-run interactive tutorial (shown once per device).
  const [showTutorial, setShowTutorial] = useState(
    () =>
      // Hidden behind online lobby joins — those players have a share-link context.
      !loadBool('tutorial-done', false, 'color-flood-tutorial-done'),
  );
  const finishTutorial = () => {
    setShowTutorial(false);
    saveString('tutorial-done', 'true');
  };
  const hasMadeFirstMove =
    session.mode === 'solo'
      ? (session.soloState?.moves ?? 0) > 0
      : (session.activeMatch?.movesCount ?? 0) > 0;

  // presentation-only state
  const [showSettings, setShowSettings] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  // P6.1: Daily Challenge hub modal (solo strip button).
  const [showDaily, setShowDaily] = useState(false);
  // P6.2: per-device solo statistics modal (header icon).
  const [showStats, setShowStats] = useState(false);

  // P5.7: prominent turn chip — who moves / who you wait for (multiplayer
  // play only). Names come from the facade (online rooms use room names).
  const turnStatus =
    session.mode === 'multiplayer' &&
    session.activeMatch &&
    session.activeMatch.status === 'playing'
      ? session.opponent === 'online' && !session.isMyTurn
        ? {
            turn: null,
            label: `Waiting for ${
              session.activeTurn === 1 ? session.playerNames.p2 : session.playerNames.p1
            }…`,
          }
        : {
            turn: session.activeTurn,
            label: `${session.activeTurn === 1 ? session.playerNames.p1 : session.playerNames.p2} to move`,
          }
      : null;

  // P5.2: keyboard shortcuts. Esc closes the app-level modals/drawer —
  // game-flow modals (game over / reset approval) stay, they gate the board.
  const closeTopModal = () => {
    // Late declarations are intentional: each branch guards before touching.
    if (showTutorial) {
      finishTutorial();
      return;
    }
    if (showDaily) {
      setShowDaily(false);
      return;
    }
    if (showStats) {
      setShowStats(false);
      return;
    }
    if (showThemeModal) {
      setShowThemeModal(false);
      return;
    }
    if (showInfoModal) {
      setShowInfoModal(false);
      return;
    }
    if (showSettings) setShowSettings(false);
  };
  useKeyboardShortcuts({
    colorCount: session.paletteColorCount,
    pickColor: session.pickColor,
    getHint: session.getHint,
    undo: session.undoSolo,
    undoAvailable:
      session.mode === 'solo' && session.canUndoSolo && !session.paletteDisabled,
    restart: session.initiateReset,
    closeTopModal,
  });

  // P4.7: the favicon download is a dev-only utility.
  const handleDownloadIcon = () => {
    const svg = document.querySelector('header svg');
    if (!svg) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = 'color-flood-icon.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // The reducers lazily build both boards during the first render (P4.4).
  if (!session.soloState || !session.localState) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-[100dvh] w-full max-w-full bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col justify-between overflow-x-hidden overflow-y-auto">
        {/* P5.3: screen-reader announcer for moves/turns/results */}
        <div aria-live="polite" role="status" className="sr-only">
          {session.announce}
        </div>
        {/* Top Streamlined Header */}
        <div className="w-full shrink-0">
          <Header
            mode={session.mode}
            onSelectMode={session.handleSelectMode}
            opponent={session.opponent}
            onChangeOpponent={session.handleChangeOpponent}
            showSettings={showSettings}
            onToggleSettings={() => setShowSettings((prev) => !prev)}
            onToggleInfo={() => setShowInfoModal(true)}
            onToggleThemes={() => setShowThemeModal(true)}
            onToggleStats={() => setShowStats(true)}
            onResetGame={session.initiateReset}
          />

          {/* Online System Banner */}
          {session.opponent === 'online' && session.onlineSystemMessage && (
            <div className="max-w-lg mx-auto px-2 mt-1">
              <div className="bg-slate-850/90 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-[11px] text-indigo-200 flex items-center gap-1.5 shadow-sm">
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{session.onlineSystemMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Playable Area */}
        <main className="w-full max-w-lg mx-auto px-2 sm:px-3 py-1 flex-1 flex flex-col items-center justify-center">
          {/* Settings Drawer */}
          {showSettings && (
            <SettingsPanel
              gridSize={session.gridSize}
              onChangeGridSize={session.handleChangeGridSize}
              colorCount={session.colorCount}
              onChangeColorCount={session.handleChangeColorCount}
              mode={session.mode}
              opponent={session.opponent}
              onChangeOpponent={session.setOpponent}
              botDifficulty={session.botDifficulty}
              onChangeBotDifficulty={session.handleSetBotDifficulty}
              showTerritoryOverlay={session.showTerritoryOverlay}
              onToggleTerritoryOverlay={() =>
                session.setShowTerritoryOverlay((prev) => !prev)
              }
              showColorSymbols={session.showColorSymbols}
              onToggleColorSymbols={() => session.setShowColorSymbols((prev) => !prev)}
              showHints={session.showHints}
              onToggleShowHints={() => session.setShowHints((prev) => !prev)}
              onResetSeries={session.resetSeries}
              onSetToEasiest={session.handleSetToEasiest}
              activeThemeId={session.themeId}
              onOpenThemeModal={() => setShowThemeModal(true)}
              challengeType={session.challengeType}
              onChangeChallengeType={session.handleChangeChallengeType}
              turnTimerSec={session.roomState?.turnTimerSec ?? 0}
              onChangeTurnTimer={
                session.turnTimerEditable ? session.handleChangeTurnTimer : undefined
              }
              soundMuted={session.soundMuted}
              onToggleSound={session.toggleSound}
              onDownloadIcon={import.meta.env.DEV ? handleDownloadIcon : undefined}
            />
          )}

          {/* Online Match: Show Lobby or Game */}
          {session.isOnlineLobbyActive ? (
            <OnlineLobby
              roomState={session.roomState}
              myRole={session.myRole}
              connectionStatus={session.connectionStatus}
              errorMessage={session.onlineError}
              systemMessage={session.onlineSystemMessage}
              gridSize={session.gridSize}
              colorCount={session.colorCount}
              onCreateRoom={(name, gSize, cCount, cType) =>
                session.createOnlineRoom(name, gSize, cCount, cType, session.themeId)
              }
              onJoinRoom={session.joinOnlineRoom}
              onLeaveRoom={session.leaveOnlineRoom}
              onClearError={session.clearOnlineError}
            />
          ) : (
            <div className="w-full flex flex-col items-center justify-between flex-1 max-h-[84vh]">
              {/* Active Mode Scoreboard */}
              {session.mode === 'solo' ? (
                <>
                  <SoloScoreboard
                    gameState={session.soloState}
                    currentHighScore={session.currentHighScore}
                    onGetHint={session.getHint}
                    hint={session.hint}
                    hintsLeft={session.soloHintsLeft}
                    colorCount={session.colorCount}
                    onUndo={session.undoSolo}
                    canUndo={session.canUndoSolo}
                  />
                  {/* P6.1: Daily Challenge strip (solo only) */}
                  <div className="w-full flex justify-center">
                    <button
                      onClick={() => setShowDaily(true)}
                      className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-slate-800/70 border border-slate-700 text-[11px] font-bold text-slate-300 hover:text-white hover:border-indigo-500/60 hover:bg-slate-800 transition-all cursor-pointer"
                      aria-label="Open the Daily Challenge hub"
                    >
                      <Flame className="w-3 h-3 text-amber-400" aria-hidden="true" />
                      <span>Daily Challenge</span>
                      <span className="text-amber-400 font-bold tabular-nums">
                        {session.dailyStreak.current}
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <TwoPlayerScoreboard
                  gameState={session.activeMatch ?? session.localState}
                  gridSize={session.matchGridSize}
                  opponent={session.opponent}
                  seriesScore={session.matchSeries}
                  isBotThinking={session.isBotThinking}
                  onGetHint={session.getHint}
                  hint={session.hint}
                  showHintButton={session.showHintButton}
                  activeEmotes={session.activeEmotes}
                  theme={session.currentTheme}
                  onRequestReset={session.initiateReset}
                  {...session.onlineOnly}
                />
              )}

              {/* Game Grid with Fluid Wave Animations & Theme Styling */}
              <div className="relative my-0.5 shrink-0 flex items-center justify-center">
                <GameGrid
                  grid={session.gridView.grid}
                  gridSize={session.gridView.gridSize}
                  mode={session.mode}
                  opponent={session.opponent}
                  p1Cells={session.gridView.p1Cells}
                  p2Cells={session.gridView.p2Cells}
                  showTerritoryOverlay={session.showTerritoryOverlay}
                  showColorSymbols={session.showColorSymbols}
                  lastMovingPlayer={session.lastMovingPlayer}
                  theme={session.currentTheme}
                  movesCount={session.gridMovesCount}
                />

                {/* Game Over Modal Overlay */}
                <GameOverModal
                  mode={session.mode}
                  soloStatus={session.soloState.status}
                  soloMoves={session.soloState.moves}
                  multiplayerStatus={session.matchStatus}
                  p1Count={session.gridView.p1Cells.length}
                  p2Count={session.gridView.p2Cells.length}
                  totalCells={session.totalCells}
                  opponent={session.opponent}
                  seriesScore={session.matchSeries}
                  challengeType={session.matchChallengeType}
                  currentStage={session.matchStage}
                  onPlayAgain={session.playAgain}
                  onAcceptRematch={session.acceptOnlineRematch}
                  onDeclineRematch={session.declineOnlineRematch}
                  onResetSeries={session.resetSeries}
                  dailyShareText={session.dailyShareText}
                  p1Name={session.onlineOnly.p1Name}
                  p2Name={session.onlineOnly.p2Name}
                  myRole={session.myRole}
                  rematchRequestedBy={session.rematchRequestedBy}
                  onLeaveRoom={session.leaveOnlineRoom}
                />
              </div>

              {/* Interactive Multiplayer Emote Reaction Bar */}
              {session.mode === 'multiplayer' && (
                <MultiplayerEmotes
                  opponent={session.opponent}
                  myRole={session.myRole}
                  activeTurn={session.activeTurn}
                  activeEmotes={session.activeEmotes}
                  onSendEmote={(sender, emoji) =>
                    session.triggerEmote(sender, emoji, true)
                  }
                  p1Name={session.playerNames.p1}
                  p2Name={session.playerNames.p2}
                  disabled={session.emoteBarDisabled}
                />
              )}

              {/* Color Action Palette */}
              <ColorPalette
                colorCount={session.paletteColorCount}
                mode={session.mode}
                onSelectColor={session.pickColor}
                disabled={session.paletteDisabled}
                hint={session.hint}
                hintGain={session.hintGain}
                soloCurrentColor={session.soloState.grid[0][0]}
                p1Color={session.activeMatch?.p1Color ?? 0}
                p2Color={session.activeMatch?.p2Color ?? 0}
                opponent={session.opponent}
                theme={session.currentTheme}
                turnStatus={turnStatus}
              />
            </div>
          )}
        </main>

        {/* Opponent Reset Approval Modal */}
        <ResetApprovalModal
          isOpen={Boolean(session.activeOnlineProposal) || session.showLocalResetConfirm}
          proposal={session.activeOnlineProposal}
          myRole={session.myRole}
          opponent={session.opponent}
          p1Name={session.roomState?.p1Name || 'Player 1'}
          p2Name={session.roomState?.p2Name || 'Player 2'}
          isLocalConfirm={session.showLocalResetConfirm}
          onAccept={
            session.opponent === 'online'
              ? session.acceptOnlineRematch
              : session.confirmLocalReset
          }
          onDecline={
            session.opponent === 'online'
              ? session.declineOnlineRematch
              : session.cancelLocalReset
          }
          onCancelLocal={session.cancelLocalReset}
        />

        {/* Theme Selector Modal */}
        <ThemeSelectorModal
          isOpen={showThemeModal}
          activeThemeId={session.themeId}
          onSelectTheme={session.handleSelectTheme}
          onClose={() => setShowThemeModal(false)}
        />

        {/* P6.1: Daily Challenge hub */}
        <DailyChallengeModal
          isOpen={showDaily}
          onClose={() => setShowDaily(false)}
          dailyDate={session.dailyDate}
          dailyShareText={session.dailyShareText}
          dailyStreak={session.dailyStreak}
          onStartDaily={() => {
            session.startDailyChallenge();
            setShowDaily(false);
          }}
        />

        {/* P6.2: solo statistics */}
        <StatsModal
          isOpen={showStats}
          onClose={() => setShowStats(false)}
          soloStats={session.soloStats}
          dailyStreak={session.dailyStreak}
          onReset={session.resetSoloStats}
        />

        {/* Rules Modal */}
        <HowToPlayModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          initialMode={session.mode}
        />

        {/* P5.7: first-run interactive tutorial (once per device) */}
        {showTutorial && !session.isOnlineLobbyActive && (
          <FirstRunTutorial
            hasMadeFirstMove={hasMadeFirstMove}
            onFinish={finishTutorial}
          />
        )}

        {/* Sleek Minimal Footer */}
        <footer className="w-full max-w-lg mx-auto py-1 px-3 text-center shrink-0">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span>
              Created by{' '}
              <span className="text-slate-400 font-semibold">Elshad Guliyev</span>
            </span>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/ell-shad"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-indigo-400 transition-colors"
                title="GitHub Profile"
              >
                <Github className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.linkedin.com/in/elshad-guliyev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-indigo-400 transition-colors"
                title="LinkedIn Profile"
              >
                <Linkedin className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
