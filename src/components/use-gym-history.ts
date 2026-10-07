'use client';
import { useEffect, useState } from 'react';
import { useWorkout } from './workout-provider';
import type { GymReadQuery } from '@/repositories/gym-cloud-query';
import type { AccountGymSnapshot } from '@/repositories/gym-cloud-client';
// Historical pages are request-local memory; changing the page replaces the window.
export function useGymHistory(query: GymReadQuery) {
  const context = useWorkout();
  const [result, setResult] = useState<{
    key: string;
    value: AccountGymSnapshot;
  } | null>(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(query);
  const client = context.cloudClient;
  const owner = context.cloud.cache?.owner;
  const revision = context.cloud.cache?.revision;
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    client
      .read(JSON.parse(key))
      .then((value) => {
        if (!cancelled) {
          setResult({ key, value });
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'History could not be loaded',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client, key, owner, revision]);
  const loaded =
    result?.key === key &&
    result.value.owner === owner &&
    result.value.revision === revision
      ? result.value
      : null;
  return {
    ...context,
    store: loaded?.store ?? context.store,
    ready: context.ready && (!owner || !!loaded),
    total: loaded?.summary?.total,
    titles: loaded?.summary?.titles,
    historyError: error,
    performance: loaded?.summary?.performance,
  };
}
