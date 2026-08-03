'use client';
import { useState } from 'react';
import { X, Lock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { appToast as toast } from '@/components/ui/AppToaster';

interface AdminCodeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
  title: string;
  description?: string;
}

export default function AdminCodeDialog({ open, onClose, onSubmit, title, description }: AdminCodeDialogProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(code.trim());
      setCode('');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'ADMIN CODE REJECTED');
    }
    setSubmitting(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
          onClick={() => !submitting && onClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-xs mx-4"
            style={{ background: 'var(--dialog-bg)', border: '1px solid rgb(var(--rgb-foreground) / 0.1)', boxShadow: 'var(--dialog-shadow)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-foreground">{title}</h2>
                <p className="text-[9px] text-foreground/20 uppercase tracking-widest mt-0.5">
                  {description || 'ENTER ADMIN CODE TO CONTINUE'}
                </p>
              </div>
              <button className="text-foreground/30 hover:text-foreground p-1" onClick={onClose} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/15" strokeWidth={1.5} />
                <input
                  type="password" value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder="Admin code" required autoFocus
                  className="w-full pl-9 pr-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
                  style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
                />
              </div>
              <button
                type="submit" disabled={!code.trim() || submitting}
                className="w-full py-2.5 text-[11px] uppercase font-bold tracking-wider text-foreground transition-all disabled:opacity-40 min-h-[44px]"
                style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }}
              >
                {submitting ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'CONFIRM'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
