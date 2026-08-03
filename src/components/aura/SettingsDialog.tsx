'use client';
import { X, Settings, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore, type TransitionLevel, type ThemeName } from '@/store/player-store';
import { useState } from 'react';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const TRANSITION_OPTIONS: Array<{ id: TransitionLevel; label: string; hint: string }> = [
  { id: 'off', label: 'OFF', hint: 'HARD CUT' },
  { id: 'low', label: 'LOW', hint: '2S' },
  { id: 'medium', label: 'MED', hint: '4S' },
  { id: 'high', label: 'HIGH', hint: '8S' },
];

const THEME_OPTIONS: Array<{ id: ThemeName; label: string; hint: string; bg: string; dot: string }> = [
  { id: 'original', label: 'ORIGINAL', hint: 'CLASSIC DARK', bg: 'linear-gradient(135deg, #0c0a18, #06040e)', dot: '#FF2D2D' },
  { id: 'darth-pink', label: 'DARTH PINK', hint: 'HOT PINK DARK', bg: 'linear-gradient(135deg, #1c0f2b, #0d0618)', dot: '#FF3DA5' },
  { id: 'diamond', label: 'DIAMOND WHITES', hint: 'LIGHT MODE', bg: 'linear-gradient(135deg, #f6f5f3, #e7e6e4)', dot: '#E82E2E' },
];

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const transition = usePlayerStore(s => s.transition);
  const setTransition = usePlayerStore(s => s.setTransition);
  const theme = usePlayerStore(s => s.theme);
  const setTheme = usePlayerStore(s => s.setTheme);
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-sm mx-4"
            style={{ background: 'var(--dialog-bg)', border: '1px solid rgb(var(--rgb-foreground) / 0.1)', boxShadow: 'var(--dialog-shadow)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Settings size={14} className="text-foreground/40" strokeWidth={2} />
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-foreground">SETTINGS</h2>
                </div>
                <p className="text-[9px] text-foreground/20 uppercase tracking-widest mt-0.5">PLAYBACK &amp; APPEARANCE</p>
              </div>
              <button className="text-foreground/30 hover:text-foreground p-1" onClick={onClose}>
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {/* Theme dropdown */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-foreground">THEME</p>
                <p className="text-[9px] text-foreground/25 uppercase tracking-wider mt-1">APPLIES INSTANTLY ACROSS THE APP</p>
                <button
                  onClick={() => setThemeOpen(!themeOpen)}
                  className="w-full mt-2 flex items-center gap-2.5 px-3 py-2 transition-all"
                  style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.12)', background: 'rgb(var(--rgb-foreground) / 0.04)' }}
                >
                  <div className="w-6 h-6 flex-shrink-0" style={{ background: THEME_OPTIONS.find(t => t.id === theme)?.bg, border: '1px solid rgb(var(--rgb-foreground) / 0.15)' }} />
                  <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-wider text-foreground">{THEME_OPTIONS.find(t => t.id === theme)?.label}</span>
                  <ChevronDown size={12} className={`text-foreground/30 transition-transform ${themeOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {themeOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 space-y-0.5">
                        {THEME_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => { setTheme(opt.id); setThemeOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 transition-all ${
                              theme === opt.id ? 'bg-foreground/8' : 'hover:bg-foreground/[0.03]'
                            }`}
                            style={{ border: theme === opt.id ? '1px solid var(--accent)' : '1px solid transparent' }}
                          >
                            <div className="w-6 h-6 flex-shrink-0" style={{ background: opt.bg, border: '1px solid rgb(var(--rgb-foreground) / 0.15)' }} />
                            <div className="flex-1 text-left">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">{opt.label}</p>
                              <p className="text-[7px] uppercase tracking-widest text-foreground/20">{opt.hint}</p>
                            </div>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.dot }} />
                            {theme === opt.id && <Check size={12} className="text-[var(--accent)] flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Song transitions */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-foreground">SONG TRANSITIONS</p>
                <p className="text-[9px] text-foreground/25 uppercase tracking-wider mt-1">
                  FADES OUT AT THE END OF EACH SONG AND FADES IN ON THE NEXT
                </p>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {TRANSITION_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setTransition(opt.id)}
                    className={`py-2 flex flex-col items-center gap-0.5 transition-all ${
                      transition === opt.id ? 'text-foreground' : 'text-foreground/30 hover:text-foreground/50'
                    }`}
                    style={{
                      border: transition === opt.id ? '1px solid var(--accent)' : '1px solid rgb(var(--rgb-foreground) / 0.08)',
                      background: transition === opt.id ? 'rgb(var(--rgb-accent) / 0.12)' : 'transparent',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                    <span className={`text-[7px] uppercase tracking-widest ${transition === opt.id ? 'text-foreground/30' : 'text-foreground/10'}`}>{opt.hint}</span>
                  </button>
                ))}
              </div>

              <p className="text-[8px] text-foreground/15 uppercase tracking-widest">SAVED AUTOMATICALLY</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
