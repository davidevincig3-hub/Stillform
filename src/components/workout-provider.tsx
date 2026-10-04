'use client';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  emptyStore,
  parseStore,
  storageKey,
  type WorkoutStore,
} from '@/repositories/workout-storage';
import {
  useBrowserReady,
  useBrowserValue,
  useStorageAvailable,
  writeBrowserValue,
} from './browser-storage';
interface WorkoutContext {
  store: WorkoutStore;
  ready: boolean;
  error: string;
  save: (store: WorkoutStore) => boolean;
}
const Context = createContext<WorkoutContext | null>(null);
export function WorkoutProvider({ children }: { children: ReactNode }) {
  const raw = useBrowserValue(storageKey);
  const ready = useBrowserReady();
  const available = useStorageAvailable();
  const [writeError, setWriteError] = useState('');
  const restored = useMemo(() => {
    try {
      return { store: raw ? parseStore(raw) : emptyStore, error: '' };
    } catch {
      return {
        store: emptyStore,
        error:
          'Saved workout data could not be loaded. Original storage is preserved until your next save.',
      };
    }
  }, [raw]);
  function save(next: WorkoutStore) {
    try {
      parseStore(JSON.stringify(next));
      writeBrowserValue(storageKey, JSON.stringify(next));
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
