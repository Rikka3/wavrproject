'use client';
import { X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore, type TransitionLevel } from '@/store/player-store';

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

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const transition = usePlayerStore(s => s.transition);
  const setTransition = usePlayerStore(s => s.setTransition);

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
            style={{ background: 'rgba(18,18,28,0.95)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Settings size={14} className="text-white/40" strokeWidth={2} />
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white">SETTINGS</h2>
                </div>
                <p className="text-[9px] text-white/20 uppercase tracking-widest mt-0.5">PLAYBACK PREFERENCES</p>
              </div>
              <button className="text-white/30 hover:text-white p-1" onClick={onClose}>
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white">SONG TRANSITIONS</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider mt-1">
                  FADES OUT AT THE END OF EACH SONG AND FADES IN ON THE NEXT
                </p>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {TRANSITION_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setTransition(opt.id)}
                    className={`py-2 flex flex-col items-center gap-0.5 transition-all ${
                      transition === opt.id ? 'text-white' : 'text-white/30 hover:text-white/50'
                    }`}
                    style={{
                      border: transition === opt.id ? '1px solid #FF2D2D' : '1px solid rgba(255,255,255,0.08)',
                      background: transition === opt.id ? 'rgba(255,45,45,0.12)' : 'transparent',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                    <span className={`text-[7px] uppercase tracking-widest ${transition === opt.id ? 'text-white/30' : 'text-white/10'}`}>{opt.hint}</span>
                  </button>
                ))}
              </div>

              <p className="text-[8px] text-white/15 uppercase tracking-widest">SAVED AUTOMATICALLY</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
