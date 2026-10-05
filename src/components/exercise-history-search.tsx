'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { findExerciseHistory } from '@/analytics/gym-history';
export function ExerciseHistorySearch({ full = false }: { full?: boolean }) {
  const { store } = useWorkout();
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState<'recent' | 'name' | 'frequency'>('recent'),
    [page, setPage] = useState(0);
  const results = findExerciseHistory(
      store.exercises,
      store.history,
      query,
      sort,
    ),
    size = full ? 20 : query ? 8 : 3,
    actualPage = Math.min(
      page,
      Math.max(0, Math.ceil(results.length / size) - 1),
    );
  return (
    <section className="card" data-testid="exercise-history-search">
      <h3>Exercise performance history</h3>
      <p className="caption">
        Real exposures: load + reps + effort. No performance score.
      </p>
      <label htmlFor="exercise-history-search">Search exercise history</label>
      <input
        id="exercise-history-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      {full && (
        <label>
          Sort exercises
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(0);
            }}
          >
            <option value="recent">Most recent</option>
            <option value="name">Name</option>
            <option value="frequency">Most completed sets</option>
          </select>
        </label>
      )}
      {!results.length && (
        <p className="caption">
          {query
            ? 'No matching exercise history.'
            : 'No personal exercise history yet.'}
        </p>
      )}
      {results.slice(actualPage * size, actualPage * size + size).map((e) => (
        <p key={e.id}>
          <Link
            className="text-button"
            href={`/gym/exercises/${encodeURIComponent(e.id)}`}
          >
            {e.name} →
          </Link>
          <span className="caption">
            {' '}
            · {e.setCount} sets · {new Date(e.lastDate).toLocaleDateString()}
          </span>
        </p>
      ))}
      {!full && (
        <Link className="text-button" href="/gym/exercise-history">
          Browse all exercise histories →
        </Link>
      )}
      <p>
        <Link className="text-button" href="/gym/exercises">
          Browse all exercises →
        </Link>
      </p>
      {full && results.length > size && (
        <div className="row start">
          <button
            className="secondary"
            disabled={actualPage === 0}
            onClick={() => setPage(actualPage - 1)}
          >
            Previous exercises
          </button>
          <span>Page {actualPage + 1}</span>
          <button
            className="secondary"
            disabled={(actualPage + 1) * size >= results.length}
            onClick={() => setPage(actualPage + 1)}
          >
            Next exercises
          </button>
        </div>
      )}
    </section>
  );
}
