'use client';
import { useState, useEffect, useCallback } from 'react';

const FALLBACK_QUOTA = 5 * 1024 * 1024;
const REFRESH_MS = 5000;

export interface StorageUsage {
  usage: number;
  quota: number;
  pct: number;
}

function fallbackUsage(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const v = localStorage.getItem(key);
    total += key.length * 2 + (v ? v.length * 2 : 0);
  }
  return total;
}

export function useStorageUsage(): StorageUsage | null {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage != null && est.quota != null && est.quota > 0) {
          setUsage({ usage: est.usage, quota: est.quota, pct: Math.min(100, (est.usage / est.quota) * 100) });
          return;
        }
      }
      if (typeof localStorage !== 'undefined') {
        const used = fallbackUsage();
        setUsage({ usage: used, quota: FALLBACK_QUOTA, pct: Math.min(100, (used / FALLBACK_QUOTA) * 100) });
        return;
      }
      setUsage(null);
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS);
    const initial = setTimeout(refresh, 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return usage;
}
