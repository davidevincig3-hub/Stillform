'use client';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  initialGymStore,
  loadGymStore,
  parseGymStore,
  gymStorageKey,
  legacyStorageKey,
  type GymStore,
} from '@/repositories/gym-storage';
import {
  useBrowserReady,
  useBrowserValue,
  useStorageAvailable,
  writeBrowserValue,
} from './browser-storage';
import {
  GymCloudClient,
  gymCloudTransport,
  gymAccountKey,
  type CloudState,
} from '@/repositories/gym-cloud-client';
interface WorkoutContext {
  store: GymStore;
  ready: boolean;
  error: string;
  save: (store: GymStore) => boolean;
  localStore: GymStore;
  localError: string;
  cloud: CloudState;
  cloudClient: GymCloudClient;
}
const Context = createContext<WorkoutContext | null>(null);
export function WorkoutProvider({ children }: { children: ReactNode }) {
  const raw = useBrowserValue(gymStorageKey);
  const legacy = useBrowserValue(legacyStorageKey);
  const ready = useBrowserReady();
  const available = useStorageAvailable();
  const [writeError, setWriteError] = useState('');
  const [cloudClient] = useState(
    () =>
      new GymCloudClient(gymCloudTransport, {
        getItem: (key) =>
          typeof window === 'undefined' ? null : localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      }),
  );
  const cloud = useSyncExternalStore(
    cloudClient.subscribe,
    cloudClient.snapshot,
    cloudClient.snapshot,
  );
  useEffect(() => {
    cloudClient.restore();
    if (cloudClient.state.status !== 'local') void cloudClient.connect();
    const refresh = () => {
      if (cloudClient.state.cache) void cloudClient.connect();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [cloudClient]);
  const restored = useMemo(() => {
    try {
      return { store: loadGymStore(raw, legacy), error: '' };
    } catch {
      return {
        store: initialGymStore(),
        error:
          'Saved workout data could not be loaded. Original data is preserved. Writes are blocked; export or recover the stored data first.',
      };
    }
  }, [raw, legacy]);
  function save(next: GymStore) {
    try {
      if (cloud.cache) return cloudClient.edit(next, cloud.cache.draft);
      if (localStorage.getItem(gymAccountKey))
        throw new Error('Account draft must be recovered before saving');
      if (restored.error) throw new Error(restored.error);
      if (localStorage.getItem(gymStorageKey) !== raw)
        throw new Error('Storage changed since this view was loaded');
      parseGymStore(JSON.stringify(next));
      writeBrowserValue(gymStorageKey, JSON.stringify(next));
      setWriteError('');
      return true;
    } catch {
      setWriteError(
        'Workout data was invalid or browser storage is unavailable. Changes were not saved.',
      );
      return false;
    }
  }
  return (
    <Context.Provider
      value={{
        store: cloud.cache?.draft ?? restored.store,
        ready: ready && cloud.status !== 'loading',
        error:
          writeError ||
          restored.error ||
          (!available && ready
            ? 'Browser storage is unavailable. Workouts cannot be restored or saved.'
            : ''),
        save,
        localStore: restored.store,
        localError: restored.error,
        cloud,
        cloudClient,
      }}
    >
      {cloud.cache && cloud.status !== 'synced' && (
        <div role="status" className="notice">
          Account Gym: {cloud.status}.{' '}
          {cloud.error || 'Unsynced edits are retained on this device.'}{' '}
          <a href="/gym">Account status</a>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function useWorkout() {
  const context = useContext(Context);
  if (!context) throw new Error('WorkoutProvider missing');
  return context;
}
