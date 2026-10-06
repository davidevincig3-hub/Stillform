'use client';
import { useEffect, useState, useMemo } from 'react';
import type { RecoveryData } from '@/analytics/polar-recovery';
import { useGymHistory } from './use-gym-history';
import { assessRecovery } from '@/analytics/recovery-engine';
import { withLocalGymEvidence } from '@/analytics/recovery-gym';

async function readRecovery() {
  const r = await fetch('/api/polar/recovery', { cache: 'no-store' });
  if (r.ok) {
    const data = (await r.json()) as RecoveryData;
    return {
      data,
      mode: data.realMode ? ('real' as const) : ('sample' as const),
    };
  }
  if (r.status === 401 || r.status === 503) {
    const status = await fetch('/api/polar/status', { cache: 'no-store' });
    if (status.ok && (await status.json()).configured === false)
      return { data: null, mode: 'sample' as const };
  }
  throw new Error(
    'Real recovery assessment unavailable. Check integration access or reload; no sample recovery is substituted.',
  );
}
export function useRecoveryData() {
  const {
    store,
    ready,
    error: storageError,
    historyError,
  } = useGymHistory({ scope: 'evidence' });
  const [data, setData] = useState<RecoveryData | null>(null),
    [mode, setMode] = useState<'real' | 'sample' | 'unavailable'>(
      'unavailable',
    ),
    [checking, setChecking] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    readRecovery()
      .then((r) => {
        if (alive) {
          setData(r.data);
          setMode(r.mode);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function refresh() {
    const result = await readRecovery();
    setData(result.data);
    setMode(result.mode);
    setError('');
  }
  const combined = useMemo(
    () =>
      data?.engineInput && ready && !storageError && !historyError
        ? {
            ...data,
            engine: assessRecovery(
              withLocalGymEvidence(data.engineInput, store.history, data.asOf),
            ),
          }
        : data,
    [data, ready, store.history, storageError, historyError],
  );
  return { data: combined, mode, checking, error, refresh };
}
