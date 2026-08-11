'use client';
import { useState, useEffect, useCallback } from 'react';

const FALLBACK_QUOTA = 5 * 1024 * 1024;
const REFRESH_MS = 5000;

export interface StorageUsage {
  usage: number;
  quota: number;
  pct: number;
}

// navigator.storage.estimate() does NOT include localStorage usage in most
// browsers, and this app stores everything in localStorage — so we measure
// localStorage directly and only use estimate() for the quota denominator.
function localStorageUsage(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const v = localStorage.getItem(key);
    total += key.length * 2 + (v ? v.length * 2 : 0);
  }
  return total;
}

async function estimateQuota(): Promise<number> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota && est.quota > 0) return est.quota;
    }
  } catch {
    // ignore, use fallback
  }
  return FALLBACK_QUOTA;
}

export function useStorageUsage(): StorageUsage | null {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (typeof localStorage === 'undefined') {
        setUsage(null);
        return;
      }
      const quota = await estimateQuota();
      const used = localStorageUsage();
      setUsage({ usage: used, quota, pct: Math.min(100, (used / quota) * 100) });
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
