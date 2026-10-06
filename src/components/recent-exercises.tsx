'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { recentExercises, shortlistStart } from '@/analytics/gym-shortlist';
import { setExercisePreference } from '@/repositories/gym-storage';

export function RecentExercises({
  onAdd,
  compact = false,
}: {
  onAdd?: (id: string) => void;
  compact?: boolean;
}) {
  const { store, ready, save, cloud } = useWorkout();
  const [limit, setLimit] = useState(compact ? 4 : 6);
  const { rows, detected, dismissed } =
    cloud.snapshot?.summary?.shortlist ?? recentExercises(store);
  return (
    <section className="card recent-exercises" data-testid="recent-exercises">
      <h2>Recent / frequently used exercises</h2>
      <p className="caption">
        {ready ? detected : '…'} recent exercises detected since{' '}
        {shortlistStart} · Europe/Rome · real local history
      </p>
      {!rows.length && (
        <p>
          No recent exercises yet. Log a workout or restore your JSON backup in
          this browser.
        </p>
      )}
      {rows
        .slice(0, limit)
        .map(({ exercise, exposures, sets, latest, pinned }) => (
          <div className="detail-set" key={exercise.id}>
            <div>
              <Link
                className="text-button"
                href={`/gym/exercises/${exercise.id}`}
              >
                {exercise.name}
              </Link>
              <p className="caption">
                {exposures} workout exposures · {sets} logged sets ·{' '}
                {latest
                  ? `last ${new Date(latest).toLocaleDateString('en-GB', { timeZone: 'Europe/Rome' })}`
                  : 'no recent exposure'}{' '}
                · {exercise.primaryMuscleGroup ?? 'Unassigned'}
              </p>
            </div>
            <div className="row start compact">
              {onAdd && (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => onAdd(exercise.id)}
                  aria-label={`Add ${exercise.name} from recent`}
                >
                  Add
                </button>
              )}
              <button
                type="button"
                className="secondary compact"
                aria-label={`${pinned ? 'Unpin' : 'Pin'} ${exercise.name}`}
                aria-pressed={pinned}
                onClick={() =>
                  save(
                    setExercisePreference(store, exercise.id, {
                      pinned: !pinned,
                    }),
                  )
                }
              >
                {pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                className="secondary compact"
                aria-label={`Dismiss ${exercise.name}`}
                onClick={() =>
                  save(
                    setExercisePreference(store, exercise.id, {
                      dismissed: true,
                    }),
                  )
                }
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      {rows.length > limit && (
        <button
          type="button"
          className="secondary"
          onClick={() => setLimit(limit + 6)}
        >
          Show more recent exercises
        </button>
      )}
      {!!dismissed.length && (
        <details>
          <summary>Dismissed suggestions ({dismissed.length})</summary>
          {dismissed.map(({ exercise }) => (
            <button
              type="button"
              className="secondary"
              key={exercise.id}
              onClick={() =>
                save(
                  setExercisePreference(store, exercise.id, {
                    dismissed: false,
                  }),
                )
              }
            >
              Restore {exercise.name}
            </button>
          ))}
        </details>
      )}
      {!compact && (
        <Link className="text-button" href="/gym/routines/new">
          Create a routine with these exercises →
        </Link>
      )}
    </section>
  );
}
