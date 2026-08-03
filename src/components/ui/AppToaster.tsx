'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const listeners: Array<(toast: ToastItem) => void> = [];
let nextId = 0;

export function appToast(message: string, type: ToastItem['type'] = 'success') {
  const toast: ToastItem = { id: nextId++, message, type };
  for (const fn of listeners) fn(toast);
}

// Convenience methods: toast.error('msg'), toast.success('msg'), etc.
appToast.error = (msg: string) => appToast(msg, 'error');
appToast.success = (msg: string) => appToast(msg, 'success');
appToast.warning = (msg: string) => appToast(msg, 'warning');
appToast.info = (msg: string) => appToast(msg, 'info');

export default function AppToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((toast: ToastItem) => {
    setToasts(prev => [...prev.slice(-4), toast]);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
      timers.current.delete(toast.id);
    }, 4000);
    timers.current.set(toast.id, timer);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, [addToast]);

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  };

  const borderColor = (type: ToastItem['type']) => {
    if (type === 'success') return '#22c55e';
    if (type === 'error') return 'var(--accent)';
    if (type === 'warning') return '#f59e0b';
    return 'rgb(var(--rgb-foreground) / 0.2)';
  };

  if (!toasts.length) return null;

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2"
      style={{ zIndex: 200, maxWidth: '360px' }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-2.5 px-4 py-3 text-foreground text-[11px] font-bold uppercase tracking-wider animate-in slide-in-from-right"
          style={{
            background: 'rgba(18,18,24,0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderLeft: `3px solid ${borderColor(t.type)}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <p className="flex-1 min-w-0 break-words" style={{ lineHeight: 1.4 }}>{t.message}</p>
          <button
            className="text-foreground/30 hover:text-foreground flex-shrink-0 p-0.5"
            onClick={() => dismiss(t.id)}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
