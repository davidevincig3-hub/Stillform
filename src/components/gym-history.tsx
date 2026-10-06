'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGymHistory } from './use-gym-history';
import { useWorkout } from './workout-provider';
import { realHistory, formatSet } from '@/analytics/gym';
import { findWorkoutHistory } from '@/analytics/gym-history';
export function GymHistory({ full = false }: { full?: boolean }) {
  const context = useWorkout();
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState(''),
    [title, setTitle] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const loaded = useGymHistory({
    scope: full ? 'history' : 'workspace',
    page,
    query,
    title,
    from,
    to,
  });
  const { store } = full ? loaded : context;
  const remote = full && !!context.cloud.cache;
  const history = findWorkoutHistory(store.history, query, title, from, to);
  const size = full ? 20 : 3;
  const actualPage = remote
    ? page
    : full
      ? Math.min(page, Math.max(0, Math.ceil(history.length / size) - 1))
      : 0;
  return (
    <>
      <div className="section-heading">
        <h2>Your completed workouts</h2>
        <span className="tag">Real local data</span>
      </div>
      {full && (
        <section className="card">
          <label>
            Search completed workouts
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Workout title
            <select
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All titles</option>
              {[
                ...new Set(
                  loaded.titles ??
                    realHistory(store.history).map((w) => w.routineName),
                ),
              ]
                .sort()
                .map((t) => (
                  <option key={t}>{t}</option>
                ))}
            </select>
          </label>
          <div className="two-grid">
            <label>
              From date
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              To date
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
        </section>
      )}
      <section className="card">
        {remote && !loaded.ready ? (
          <p role="status">{loaded.historyError || 'Loading history…'}</p>
        ) : !history.length ? (
          <p className="muted">
            No confirmed completed workouts yet. Finish a workout to build your
            history.
          </p>
        ) : (
          history
            .slice(
              remote ? 0 : actualPage * size,
              remote ? size : actualPage * size + size,
            )
            .map((w) => (
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
                      <h3>
                        <Link
                          href={`/gym/exercises/${encodeURIComponent(e.exerciseId)}`}
                        >
                          {e.name}
                        </Link>
                      </h3>
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
      {!full && (
        <Link className="text-button" href="/gym/history">
          View all completed workouts →
        </Link>
      )}
      {full && (loaded.total ?? history.length) > size && (
        <div className="row start">
          <button
            className="secondary"
            disabled={actualPage === 0}
            onClick={() => setPage(actualPage - 1)}
          >
            Previous workouts
          </button>
          <span>Page {actualPage + 1}</span>
          <button
            className="secondary"
            disabled={
              (actualPage + 1) * size >= (loaded.total ?? history.length)
            }
            onClick={() => setPage(actualPage + 1)}
          >
            Next workouts
          </button>
        </div>
      )}
    </>
  );
}
