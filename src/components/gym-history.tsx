'use client';
import Link from 'next/link';
import { useWorkout } from './workout-provider';
import { realHistory, formatSet } from '@/analytics/gym';
export function GymHistory() {
  const { store } = useWorkout();
  const history = realHistory(store.history);
  return (
    <>
      <div className="section-heading">
        <h2>Your completed workouts</h2>
        <span className="tag">Real local data</span>
      </div>
      <section className="card">
        {!history.length ? (
          <p className="muted">
            No confirmed completed workouts yet. Finish a workout to build your
            history.
          </p>
        ) : (
          history.map((w) => (
            <details key={w.id}>
              <summary>
                {w.routineName} · {new Date(w.startedAt).toLocaleString()} ·{' '}
                {w.exercises.reduce(
                  (n, e) => n + e.sets.filter((s) => s.completed).length,
                  0,
                )}{' '}
                completed sets ·{' '}
                {w.durationMinutes === null
                  ? 'Duration unavailable'
                  : `${Math.round(w.durationMinutes)} min`}
              </summary>
              <Link
                className="text-button"
                href={`/gym/history/${encodeURIComponent(w.id)}`}
              >
                Open workout detail →
              </Link>
              {w.exercises.map((e) => (
                <div key={e.id}>
                  <h3>{e.name}</h3>
                  {e.sets
                    .filter((s) => s.completed)
                    .map((s) => (
                      <p className="caption" key={s.id}>
                        {formatSet(s)}
                      </p>
                    ))}
                </div>
              ))}
            </details>
          ))
        )}
      </section>
    </>
  );
}
