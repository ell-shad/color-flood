/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Check, X, Clock, HelpCircle, Swords } from 'lucide-react';
import { ResetProposal, MultiplayerOpponent } from '../types';

interface ResetApprovalModalProps {
  isOpen: boolean;
  proposal: ResetProposal | null;
  myRole: 1 | 2 | null;
  opponent: MultiplayerOpponent;
  p1Name?: string;
  p2Name?: string | null;
  isLocalConfirm?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancelLocal?: () => void;
}

export const ResetApprovalModal: React.FC<ResetApprovalModalProps> = ({
  isOpen,
  proposal,
  myRole,
  opponent,
  p1Name = 'Player 1',
  p2Name = 'Player 2',
  isLocalConfirm = false,
  onAccept,
  onDecline,
  onCancelLocal,
}) => {
  if (!isOpen) return null;

  // Local Pass & Play Reset Confirmation
  if (isLocalConfirm || opponent === 'local') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <RotateCcw className="w-6 h-6 animate-spin-slow" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Reset Current Match?
              </h3>
              <p className="text-xs text-slate-400">
                Both players will start a brand new round with alternating first turns.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onCancelLocal || onDecline}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                onClick={onAccept}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Reset</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Online Multiplayer Approval Flow
  if (!proposal) return null;

  const isRequester = myRole === proposal.requestedBy;
  const requesterName =
    proposal.requestedBy === 1 ? p1Name : p2Name || 'Player 2';
  const otherName = proposal.requestedBy === 1 ? p2Name || 'Player 2' : p1Name;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4 text-center"
        >
          {isRequester ? (
            <>
              {/* Waiting for Opponent */}
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Reset Requested
                </h3>
                <p className="text-xs text-slate-400">
                  Waiting for <strong className="text-slate-200">{otherName}</strong> to approve the match reset...
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={onDecline}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all cursor-pointer"
                >
                  Cancel Request
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Opponent Asking for Approval */}
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
                <HelpCircle className="w-6 h-6 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Opponent Requested Reset
                </h3>
                <p className="text-xs text-slate-400">
                  <strong className="text-cyan-400">{requesterName}</strong> wants to reset the match and start a new round.
                </p>
                {proposal.targetStage && (
                  <div className="text-[11px] text-amber-300 font-mono bg-amber-950/40 py-1 px-2 rounded-lg border border-amber-500/30 inline-block mt-1">
                    Advance to Stage {proposal.targetStage}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onDecline}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Decline</span>
                </button>
                <button
                  onClick={onAccept}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept Reset</span>
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
