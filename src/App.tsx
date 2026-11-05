import React, { useState } from 'react';
import { Github, Linkedin, Info } from 'lucide-react';

import { useGameSession } from './hooks/useGameSession';

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

/**
 * P4.1: App is now a thin render shell.
 *
 * All game state, engines, effects and persistence live behind the
 * `useGameSession()` view model (P4.2–P4.4, P4.5, P4.8). Only presentation
 * state (modals/settings drawer) and the dev-only favicon utility remain.
 */
export default function App() {
  const session = useGameSession();

  // presentation-only state
  const [showSettings, setShowSettings] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

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
    <div className="h-[100dvh] w-full max-w-full bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col justify-between overflow-x-hidden overflow-y-auto">
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
              <SoloScoreboard
                gameState={session.soloState}
                currentHighScore={session.currentHighScore}
                onGetHint={session.getHint}
                hint={session.hint}
                hintsLeft={session.soloHintsLeft}
                colorCount={session.colorCount}
              />
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
                onSendEmote={(sender, emoji) => session.triggerEmote(sender, emoji, true)}
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
              activeTurn={session.activeTurn}
              opponent={session.opponent}
              theme={session.currentTheme}
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

      {/* Rules Modal */}
      <HowToPlayModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        initialMode={session.mode}
      />

      {/* Sleek Minimal Footer */}
      <footer className="w-full max-w-lg mx-auto py-1 px-3 text-center shrink-0">
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
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
  );
}
