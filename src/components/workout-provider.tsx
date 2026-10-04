'use client';
import {
  createContext,
  useContext,
  useMemo,
  useState,
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
interface WorkoutContext {
  store: GymStore;
  ready: boolean;
  error: string;
  save: (store: GymStore) => boolean;
}
const Context = createContext<WorkoutContext | null>(null);
export function WorkoutProvider({ children }: { children: ReactNode }) {
  const raw = useBrowserValue(gymStorageKey);
  const legacy = useBrowserValue(legacyStorageKey);
  const ready = useBrowserReady();
  const available = useStorageAvailable();
  const [writeError, setWriteError] = useState('');
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
      if (restored.error) throw new Error(restored.error);
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
        store: restored.store,
        ready,
        error:
          writeError ||
          restored.error ||
          (!available && ready
            ? 'Browser storage is unavailable. Workouts cannot be restored or saved.'
            : ''),
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkout() {
  const context = useContext(Context);
  if (!context) throw new Error('WorkoutProvider missing');
  return context;
}
