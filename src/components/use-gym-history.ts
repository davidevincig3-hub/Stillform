'use client';
import { useEffect, useState } from 'react';
import { useWorkout } from './workout-provider';
import type { GymReadQuery } from '@/repositories/gym-cloud-query';
import {
  CloudRequestError,
  type AccountGymSnapshot,
} from '@/repositories/gym-cloud-client';
import { initialGymStore } from '@/repositories/gym-storage';
// Historical pages are request-local memory; changing the page replaces the window.
export function useGymHistory(query: GymReadQuery) {
  const context = useWorkout();
  const [result, setResult] = useState<{
    key: string;
    value: AccountGymSnapshot;
  } | null>(null);
  const [requestState, setRequestState] = useState<{
    identity: string;
    error: string;
    stamp: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const key = JSON.stringify(query);
  const previousQuery = query.scope === 'previous';
  const stableHistoryQuery = previousQuery || query.scope === 'trend';
  const client = context.cloudClient;
  const owner =
    context.cloud.cache?.owner ??
    (stableHistoryQuery ? context.cloud.snapshot?.owner : undefined);
  const revision = stableHistoryQuery
    ? context.cloud.historyEpoch
    : context.cloud.cache?.revision;
  const identity = JSON.stringify([owner, key]);
  const stamp = `${revision ?? 0}:${retryCount}`;
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      client
        .read(JSON.parse(key))
        .then((value) => {
          if (!cancelled) {
            setResult({ key, value });
            setRequestState({ identity, error: '', stamp });
          }
        })
        .catch((e) => {
          if (cancelled) return;
          const status = e instanceof CloudRequestError ? e.status : 0;
          const retryable =
            !status || status === 408 || status === 429 || status >= 500;
          setRequestState({
            identity,
            error: !stableHistoryQuery
              ? e instanceof Error
                ? e.message
                : 'History could not be loaded'
              : status === 401 || status === 403
                ? 'History access requires account verification.'
                : `${previousQuery ? 'Previous history' : 'Performance trend'} could not be refreshed${e instanceof CloudRequestError && e.diagnostic ? ` (${e.diagnostic.code}, HTTP ${status})` : ''}.`,
            stamp,
          });
          if (stableHistoryQuery && attempt === 0 && retryable)
            timer = setTimeout(() => load(1), 1500);
        });
    };
    load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    client,
    key,
    owner,
    revision,
    identity,
    stamp,
    retryCount,
    previousQuery,
    stableHistoryQuery,
  ]);
  const loaded =
    result?.key === key &&
    result.value.owner === owner &&
    (stableHistoryQuery || result.value.revision === revision)
      ? result.value
      : null;
  return {
    ...context,
    store:
      loaded?.store ??
      (stableHistoryQuery && owner
        ? { ...initialGymStore(), exercises: [], history: [] }
        : context.store),
    ready: context.ready && (!owner || !!loaded),
    total: loaded?.summary?.total,
    titles: loaded?.summary?.titles,
    historyError: requestState?.identity === identity ? requestState.error : '',
    historyUpdating:
      !!owner &&
      (!requestState ||
        requestState.identity !== identity ||
        requestState.stamp !== stamp),
    retryHistory: () => setRetryCount((value) => value + 1),
    performance: loaded?.summary?.performance,
    trend: loaded?.summary?.trend,
  };
}
