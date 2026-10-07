'use client';
import { exerciseExposures, effortKnown, formatSet } from '@/analytics/gym';
import { useGymHistory } from './use-gym-history';
export function PreviousPerformance({ exerciseId }: { exerciseId: string }) {
  const { store, ready, historyError, historyUpdating, retryHistory } =
    useGymHistory({
      scope: 'previous',
      id: exerciseId,
      limit: 4,
    });
  const status = (
    <>
      {historyError && (
        <p className="caption" role="alert">
          {historyError}{' '}
          {ready
            ? 'Showing last available references; not refreshed.'
            : 'No account history available yet.'}{' '}
          This concerns history reading; see Account Gym for save status.
        </p>
      )}
      {historyUpdating && (
        <p className="caption">
          Updating previous history…{' '}
          {ready ? 'Showing last available references.' : ''}
        </p>
      )}
      {historyError && (
        <button type="button" className="secondary" onClick={retryHistory}>
          Retry previous history
        </button>
      )}
    </>
  );
  if (!ready)
    return (
      <div className="previous-empty">
        {status}
        {!historyError && 'Loading previous performance…'}
      </div>
    );
  const exposures = exerciseExposures(store.history, exerciseId);
  if (!exposures.length)
    return (
      <div className="previous-empty">
        {status}
        <p>No previous real exposure yet.</p>
      </div>
    );
  const first = exposures[0];
  return (
    <div className="previous-performance">
      {status}
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
