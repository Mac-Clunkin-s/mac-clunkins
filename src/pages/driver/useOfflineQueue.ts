import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getOfflineQueue, type FlushResult } from './offlineQueue';
import { sendQueued } from './sync';

export function useOfflineQueue() {
  const { profile } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [rejected, setRejected] = useState<FlushResult['rejected']>([]);

  const refresh = useCallback(async () => setPending(await getOfflineQueue().size()), []);

  const sync = useCallback(async () => {
    if (!profile || !navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await getOfflineQueue().flush((a) => sendQueued(a, profile.id));
      if (r.rejected.length) setRejected((x) => [...x, ...r.rejected]);
    } finally {
      setSyncing(false);
      void refresh();
    }
  }, [profile, refresh]);

  useEffect(() => {
    const q = getOfflineQueue();
    void refresh();
    const unsub = q.subscribe(() => void refresh());
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    if (navigator.onLine) void sync();
    return () => {
      unsub();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh, sync]);

  return { online, pending, syncing, rejected, sync, refresh };
}
