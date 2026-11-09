import React, { Suspense, lazy, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Github, Linkedin, Info, Eye } from 'lucide-react';

import { useGameSession } from './hooks/useGameSession';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useBoardFit } from './hooks/useBoardFit';
import { loadBool, saveString } from './utils/storage';

// Boot-critical chrome: needed for the very first playable frame.
import { Header } from './components/Header';
import { SoloScoreboard } from './components/SoloScoreboard';
import { TwoPlayerScoreboard } from './components/TwoPlayerScoreboard';
import { GameGrid } from './components/GameGrid';
import { WheelBoard } from './components/WheelBoard';
import { ColorPalette } from './components/ColorPalette';

/**
 * Perf: everything else is split out of the initial bundle. These views are
 * only reachable behind a user action (settings sheet, modals, online lobby)
 * or a mode gate — eagerly bundling them grew the module graph so the dev
 * server's transform waterfall (and the prod initial chunk with it) made
 * both the site and the game noticeably slower to appear. Each is mounted
 * under a <Suspense fallback={null}> boundary that only renders when its
 * gate opens, so its code is fetched on first use instead of at boot.
 */
const GameOverModal = lazy(() =>
  import('./components/GameOverModal').then((m) => ({ default: m.GameOverModal })),
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const OnlineLobby = lazy(() =>
  import('./components/OnlineLobby').then((m) => ({ default: m.OnlineLobby })),
);
const MultiplayerEmotes = lazy(() =>
  import('./components/MultiplayerEmotes').then((m) => ({
    default: m.MultiplayerEmotes,
  })),
);
const ResetApprovalModal = lazy(() =>
  import('./components/ResetApprovalModal').then((m) => ({
    default: m.ResetApprovalModal,
  })),
);
const ThemeSelectorModal = lazy(() =>
  import('./components/ThemeSelectorModal').then((m) => ({
    default: m.ThemeSelectorModal,
  })),
);
const HowToPlayModal = lazy(() =>
  import('./components/HowToPlayModal').then((m) => ({ default: m.HowToPlayModal })),
);
const FirstRunTutorial = lazy(() =>
  import('./components/FirstRunTutorial').then((m) => ({ default: m.FirstRunTutorial })),
);
const DailyChallengeModal = lazy(() =>
  import('./components/DailyChallengeModal').then((m) => ({
    default: m.DailyChallengeModal,
  })),
);
const StatsModal = lazy(() =>
  import('./components/StatsModal').then((m) => ({ default: m.StatsModal })),
);
const ReplayModal = lazy(() =>
  import('./components/ReplayModal').then((m) => ({ default: m.ReplayModal })),
);

/**
 * P4.1: App is now a thin render shell.
 *
 * All game state, engines, effects and persistence live behind the
 * `useGameSession()` view model (P4.2–P4.4, P4.5, P4.8). Only presentation
 * state (modals/settings drawer) and the dev-only favicon utility remain.
 */
export default function App() {
  const session = useGameSession();
  // P8: the board fills whatever the play column has left, so the HUD, board
  // and palette stay one tight stack at any viewport size.
  const [boardRef, boardPx] = useBoardFit<HTMLDivElement>();

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
  // P6.3: replay viewer (opened from the solo game-over card).
  const [showReplay, setShowReplay] = useState(false);
  // P6.4: browser install affordance (header button when allowed).
  const { canInstall, install: installPwa } = useInstallPrompt();

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
    if (showReplay) {
      setShowReplay(false);
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
      <div className="h-[100dvh] w-full max-w-full bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col overflow-x-hidden overflow-y-auto">
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
            onToggleStats={() => setShowStats(true)}
            onResetGame={session.initiateReset}
            canInstall={canInstall}
            onInstall={installPwa}
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

          {/* P6.6: Spectator banner — receive-only seat live view */}
          {session.opponent === 'online' && session.spectating && (
            <div className="max-w-lg mx-auto px-2 mt-1">
              <div className="bg-indigo-950/80 border border-indigo-500/40 px-2.5 py-1 rounded-lg text-[11px] text-indigo-200 flex items-center gap-1.5 shadow-sm">
                <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">
                  Watching{' '}
                  <strong className="text-cyan-300 font-semibold">
                    {session.playerNames.p1 || 'Player 1'}
                  </strong>{' '}
                  vs{' '}
                  <strong className="text-rose-300 font-semibold">
                    {session.playerNames.p2 || 'Player 2'}
                  </strong>{' '}
                  · 👀 {session.spectatorCount}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Main Playable Area */}
        <main className="w-full max-w-xl mx-auto px-2 sm:px-3 pt-1.5 pb-1 flex-1 min-h-0 flex flex-col">
          {/* Online Match: Show Lobby or Game */}
          {session.isOnlineLobbyActive ? (
            <Suspense fallback={null}>
              <OnlineLobby
                roomState={session.roomState}
                myRole={session.myRole}
                connectionStatus={session.connectionStatus}
                errorMessage={session.onlineError}
                systemMessage={session.onlineSystemMessage}
                gridSize={session.gridSize}
                colorCount={session.colorCount}
                onCreateRoom={(name, gSize, cCount, cType, shape) =>
                  session.createOnlineRoom(
                    name,
                    gSize,
                    cCount,
                    cType,
                    session.themeId,
                    shape,
                  )
                }
                onJoinRoom={session.joinOnlineRoom}
                onSpectateRoom={session.spectateOnline}
                onLeaveRoom={session.leaveOnlineRoom}
                onClearError={session.clearOnlineError}
                errorCode={session.onlineErrorCode}
                spectatorCount={session.spectatorCount}
              />
            </Suspense>
          ) : (
            <div className="w-full flex-1 min-h-0 flex flex-col justify-center gap-1.5 sm:gap-2">
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
                    shape={session.soloState.shape}
                    boardSize={session.soloState.boardSize}
                    onOpenDaily={() => setShowDaily(true)}
                    dailyStreak={session.dailyStreak.current}
                  />
                </>
              ) : (
                <TwoPlayerScoreboard
                  gameState={session.activeMatch ?? session.localState}
                  gridSize={session.matchGridSize}
                  shape={session.boardShape}
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

              {/* Game Board with Fluid Wave Animations & Theme Styling —
                  P7: solo wheel games render as a mandala SVG board instead. */}
              <div
                ref={boardRef}
                className="relative w-full flex items-center justify-center"
              >
                {boardPx > 0 && (
                  <div className="relative" style={{ width: boardPx, height: boardPx }}>
                    {session.boardShape === 'wheel' ? (
                      <WheelBoard
                        grid={session.gridView.grid}
                        size={
                          session.mode === 'solo'
                            ? session.soloState.boardSize
                            : session.gridView.gridSize
                        }
                        theme={session.currentTheme}
                        showColorSymbols={session.showColorSymbols}
                        boardPx={boardPx}
                        mode={session.mode}
                        opponent={session.opponent}
                        p1Cells={session.gridView.p1Cells}
                        p2Cells={session.gridView.p2Cells}
                        showTerritoryOverlay={session.showTerritoryOverlay}
                      />
                    ) : (
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
                        boardPx={boardPx}
                      />
                    )}

                    {/* Game Over Modal Overlay — code-split: fetched only when a
                    round actually ends (its own render gate, mirrored here). */}
                    {(session.soloState.status !== 'playing' ||
                      session.matchStatus !== 'playing') && (
                      <Suspense fallback={null}>
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
                          onWatchReplay={
                            session.mode === 'solo' &&
                            session.soloState.status !== 'playing'
                              ? () => setShowReplay(true)
                              : undefined
                          }
                          shareBoardLink={session.soloShareUrl}
                          p1Name={session.onlineOnly.p1Name}
                          p2Name={session.onlineOnly.p2Name}
                          myRole={session.myRole}
                          rematchRequestedBy={session.rematchRequestedBy}
                          onLeaveRoom={session.leaveOnlineRoom}
                          spectating={session.spectating}
                          isHost={session.myRole === 1}
                          onHostRematch={session.hostOnlineRematch}
                        />
                      </Suspense>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive Multiplayer Emote Reaction Bar */}
              {session.mode === 'multiplayer' && (
                <Suspense fallback={null}>
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
                </Suspense>
              )}

              {/* Color Action Palette (hidden for spectator seats) */}
              {!session.spectating && (
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
              )}
            </div>
          )}
        </main>

        {/* Settings sheet — outside the play column, so opening it never
            moves the board and it stays anchored to the header button. */}
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsPanel
              gridSize={session.gridSize}
              onChangeGridSize={session.handleChangeGridSize}
              colorCount={session.colorCount}
              onChangeColorCount={session.handleChangeColorCount}
              boardShape={session.boardShape}
              onChangeBoardShape={session.handleChangeBoardShape}
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
              onChangeTurnTimerSec={
                session.turnTimerEditable ? session.handleChangeTurnTimer : undefined
              }
              soundMuted={session.soundMuted}
              onToggleSound={session.toggleSound}
              onDownloadIcon={import.meta.env.DEV ? handleDownloadIcon : undefined}
              onClose={() => setShowSettings(false)}
              onOpenInfo={() => {
                setShowSettings(false);
                setShowInfoModal(true);
              }}
            />
          </Suspense>
        )}

        {/* Opponent Reset Approval Modal — mounted only while a proposal or
            local confirm exists; its props already carry every state it needs. */}
        {(Boolean(session.activeOnlineProposal) || session.showLocalResetConfirm) && (
          <Suspense fallback={null}>
            <ResetApprovalModal
              isOpen={true}
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
          </Suspense>
        )}

        {showThemeModal && (
          <Suspense fallback={null}>
            <ThemeSelectorModal
              isOpen={true}
              activeThemeId={session.themeId}
              onSelectTheme={session.handleSelectTheme}
              onClose={() => setShowThemeModal(false)}
            />
          </Suspense>
        )}

        {showDaily && (
          <Suspense fallback={null}>
            <DailyChallengeModal
              isOpen={true}
              onClose={() => setShowDaily(false)}
              dailyDate={session.dailyDate}
              dailyShareText={session.dailyShareText}
              dailyStreak={session.dailyStreak}
              onStartDaily={() => {
                session.startDailyChallenge();
                setShowDaily(false);
              }}
            />
          </Suspense>
        )}

        {showStats && (
          <Suspense fallback={null}>
            <StatsModal
              isOpen={true}
              onClose={() => setShowStats(false)}
              soloStats={session.soloStats}
              dailyStreak={session.dailyStreak}
              onReset={session.resetSoloStats}
            />
          </Suspense>
        )}

        {/* P6.3: replay viewer (over the game-over card) */}
        {showReplay && session.mode === 'solo' && session.soloState && (
          <Suspense fallback={null}>
            <ReplayModal
              isOpen={true}
              onClose={() => setShowReplay(false)}
              grid={session.soloState.grid}
              history={session.soloState.history}
              playedColors={session.soloState.playedColors}
              theme={session.currentTheme}
              shape={session.soloState.shape}
              size={session.soloState.boardSize}
            />
          </Suspense>
        )}

        {showInfoModal && (
          <Suspense fallback={null}>
            <HowToPlayModal
              isOpen={true}
              onClose={() => setShowInfoModal(false)}
              initialMode={session.mode}
            />
          </Suspense>
        )}

        {/* P5.7: first-run interactive tutorial (once per device) */}
        {showTutorial && !session.isOnlineLobbyActive && (
          <Suspense fallback={null}>
            <FirstRunTutorial
              hasMadeFirstMove={hasMadeFirstMove}
              onFinish={finishTutorial}
              boardShape={session.mode === 'solo' ? session.boardShape : 'classic'}
            />
          </Suspense>
        )}

        {/* Sleek Minimal Footer */}
        <footer className="w-full max-w-xl mx-auto pt-0.5 pb-1 px-3 text-center shrink-0">
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
