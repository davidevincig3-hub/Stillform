'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { realHistory, formatSet } from '@/analytics/gym';
export function GymHistory() {
  const { store } = useWorkout();
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
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
          history.slice(page * 20, page * 20 + 20).map((w) => (
            <details
              key={w.id}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setOpened((o) => ({ ...o, [w.id]: open }));
              }}
            >
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
              {opened[w.id] &&
                w.exercises.map((e) => (
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
      {history.length > 20 && (
        <div className="row start">
          <button
            className="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous workouts
          </button>
          <span>Page {page + 1}</span>
          <button
            className="secondary"
            disabled={(page + 1) * 20 >= history.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next workouts
          </button>
        </div>
      )}
    </>
  );
}
