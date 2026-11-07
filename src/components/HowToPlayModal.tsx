import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Swords, CheckCircle2 } from 'lucide-react';
import { GameMode } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: GameMode;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  initialMode,
}) => {
  const [activeTab, setActiveTab] = useState<'solo' | 'multiplayer'>(initialMode);
  // P5.3: dialog semantics, focus trap, focus restore.
  const panelRef = useModalA11y(isOpen);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="How to play"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">How to Play</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('solo')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'solo'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Solo Puzzle</span>
            </button>
            <button
              onClick={() => setActiveTab('multiplayer')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'multiplayer'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>2P Territory Battle</span>
            </button>
          </div>

          {/* Content */}
          {activeTab === 'solo' ? (
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Goal:</strong> Fill the entire grid with a single color before
                  your move limit runs out.
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Starting Root:</strong> You always control the top-left tile (0,
                  0). Click any of the color buttons below to recolor your connected
                  block.
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Wheel boards:</strong> switch Board Shape to <em>Wheel</em> in
                  Settings — same flood rule, but solo play pours out of the center core
                  and spreads ring by ring, while a two-player match seeds both players on
                  the outer ring and floods inward.
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Smart Hint:</strong> Tap the <em>Hint</em> lightbulb to identify
                  the color that claims the highest number of adjacent cells in one
                  stroke.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Goal:</strong> Capture more than <strong>50%</strong> of the
                  board cells (or finish with more territory than your rival).
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Corners:</strong>{' '}
                  <span className="text-cyan-400 font-bold">Player 1</span> starts at the{' '}
                  <em>Top-Left</em> corner.{' '}
                  <span className="text-rose-400 font-bold">Player 2 (or AI Bot)</span>{' '}
                  starts at the <em>Bottom-Right</em> corner.
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Color Locking:</strong> You take turns choosing a color. You{' '}
                  <em>cannot</em> pick your current color, and you <em>cannot</em> pick
                  the color currently owned by your opponent!
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Absorption:</strong> When you pick a color, your whole empire
                  changes to that color and absorbs any adjacent neutral cells matching
                  it.
                </p>
              </div>
              <div className="flex gap-2.5 items-start">
                <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Play Modes:</strong> Challenge a friend{' '}
                  <strong>Online from distance</strong> via room code or instant shareable
                  link, play <strong>Pass & Play</strong> locally on one device, or battle
                  the <strong>AI Bot</strong> (Easy, Medium, Master).
                </p>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer mt-2"
          >
            Got it, Let's Play!
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
