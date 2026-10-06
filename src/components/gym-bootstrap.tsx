'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import {
  canBootstrapGym,
  previewGymBootstrap,
  commitGymBootstrap,
} from '@/repositories/gym-export';
export function GymBootstrap() {
  const { store, ready, error, save, cloud } = useWorkout();
  const [plan, setPlan] = useState<ReturnType<
    typeof previewGymBootstrap
  > | null>(null);
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState('');
  if (cloud.cache) return null;
  return (
    <section>
      <h3>Set up an empty phone / browser from JSON</h3>
      <p className="caption">
        Gym data is local to each browser and URL. This reviewed copy preserves
        IDs, mappings, routines and active workouts; it is not cloud sync.
        Choose one browser for logging.
      </p>
      <label>
        Stillform JSON backup
        <input
          type="file"
          accept=".json,application/json"
          disabled={!ready || !!error || !canBootstrapGym(store)}
          onChange={async (e) => {
            setPlan(null);
            setApproved(false);
            setMessage('');
            try {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 50 * 1024 * 1024)
                  throw new Error('Backup exceeds 50 MB');
                setPlan(previewGymBootstrap(await file.text(), store));
              }
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Invalid backup');
            }
          }}
        />
      </label>
      {!canBootstrapGym(store) && (
        <p className="caption">
          This browser already has Gym data. JSON bootstrap cannot overwrite it.
        </p>
      )}
      {plan && (
        <section className="notice">
          <h3>Review backup copy</h3>
          <p>
            {plan.data.history.length} completed workouts ·{' '}
            {plan.data.exercises.length} exercises · {plan.data.routines.length}{' '}
            routines ·{' '}
            {plan.data.active
              ? 'one active workout to resume'
              : 'no active workout'}{' '}
            · exported {plan.exportedAt}
          </p>
          <label>
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I reviewed this backup and want to copy it into this empty browser
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!approved}
            onClick={() => {
              try {
                commitGymBootstrap(plan, store, approved, save);
                setPlan(null);
                setMessage(
                  'Backup copied. Original IDs and provenance preserved.',
                );
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Restore failed');
              }
            }}
          >
            Confirm JSON bootstrap
          </button>
        </section>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
