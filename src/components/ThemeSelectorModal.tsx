import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Check, X } from 'lucide-react';
import { ThemeId } from '../types';
import { THEMES } from '../utils/themes';
import { useModalA11y } from '../hooks/useModalA11y';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  activeThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  activeThemeId,
  onSelectTheme,
  onClose,
}) => {
  // P5.3: dialog semantics, focus trap, focus restore.
  const panelRef = useModalA11y(isOpen);
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Theme selection"
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Board & Palette Themes
                </h3>
                <p className="text-[11px] text-slate-400">
                  Choose your favorite visual style
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Theme List */}
          <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => {
              const theme = THEMES[id];
              const isSelected = activeThemeId === id;

              return (
                <button
                  key={id}
                  onClick={() => {
                    onSelectTheme(id);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-slate-800/90 border-indigo-500 ring-1 ring-indigo-500/40 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{theme.name}</span>
                      {id === 'arcade' && (
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1 rounded">
                          Classic
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {/* 8-Color Palette Swatch Strip */}
                  <div className="flex items-center gap-1.5 w-full">
                    {theme.colors.map((color, idx) => (
                      <div
                        key={idx}
                        className="h-4 flex-1 rounded-sm shadow-inner transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                        title={theme.colorNames[idx]}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Close button */}
          <div className="pt-2 border-t border-slate-800 shrink-0">
            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
