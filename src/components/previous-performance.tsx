'use client';
import { exerciseExposures, effortKnown, formatSet } from '@/analytics/gym';
import { useGymHistory } from './use-gym-history';
export function PreviousPerformance({ exerciseId }: { exerciseId: string }) {
  const { store, ready, historyError } = useGymHistory({
    scope: 'exercise',
    id: exerciseId,
    limit: 4,
  });
  if (!ready)
    return (
      <p className="previous-empty">
        {historyError || 'Loading previous performance…'}
      </p>
    );
  const exposures = exerciseExposures(store.history, exerciseId);
  if (!exposures.length)
    return <p className="previous-empty">No previous real exposure yet.</p>;
  const first = exposures[0];
  return (
    <div className="previous-performance">
      <p className="eyebrow">
        Previous performance · {new Date(first.date).toLocaleDateString()}
      </p>
      {first.sets.map((s) => (
        <p key={s.id}>{formatSet(s)}</p>
      ))}
      {first.sets.some((s) => !effortKnown(s)) && (
        <p className="caption">
          Effort missing for some sets; direct comparisons are limited.
        </p>
      )}
      {exposures.length > 1 && (
        <details>
          <summary>Last {exposures.length} exposures</summary>
          {exposures.slice(1).map((e) => (
            <div key={e.workoutId}>
              <p className="caption">{new Date(e.date).toLocaleDateString()}</p>
              {e.sets.map((s) => (
                <p key={s.id}>{formatSet(s)}</p>
              ))}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
