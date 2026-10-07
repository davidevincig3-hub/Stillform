'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGymHistory } from './use-gym-history';
import { exerciseExposures, effortKnown, formatSet } from '@/analytics/gym';
import { PageHeading } from './assessment';
import { gymPerformance } from '@/analytics/gym-performance';
import { ExercisePerformance } from './exercise-performance';
export function ExerciseDetail({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const { store, ready, total, cloud, performance, historyError } =
    useGymHistory({
      scope: 'exercise',
      id,
      page,
    });
  const [limit, setLimit] = useState(20);
  if (historyError)
    return (
      <p role="alert">
        Exercise history unavailable: {historyError}. Reload to retry.
      </p>
    );
  if (!ready) return <p>Loading exercise…</p>;
  const exercise = store.exercises.find((e) => e.id === id);
  if (!exercise)
    return (
      <section className="card">
        <h1>Exercise not found</h1>
        <Link href="/gym/exercises">Exercise library</Link>
      </section>
    );
  const exposures = exerciseExposures(
    store.history,
    id,
    Number.MAX_SAFE_INTEGER,
  );
  return (
    <>
      <Link className="text-button" href="/gym/exercises">
        ← Exercise library
      </Link>
      <PageHeading
        title={exercise.name}
        subtitle={`${exercise.primaryMuscleGroup ?? 'Unassigned'} · ${exercise.equipment ?? 'Equipment unspecified'} · Real exposure history`}
      />
      {cloud.cache ? (
        performance ? (
          <ExercisePerformance data={performance} />
        ) : (
          <p role="status">
            Account performance summary unavailable. Reload to retry; paged
            history is not used for conclusions.
          </p>
        )
      ) : (
        <ExercisePerformance data={gymPerformance(store.history, id)} />
      )}
      {!exposures.length ? (
        <section className="card">
          <h3>No completed exposures yet</h3>
          <p className="muted">
            Log this exercise to build history. Sample performances are never
            used.
          </p>
        </section>
      ) : (
        exposures.slice(0, limit).map((e) => (
          <section className="card" key={e.workoutId}>
            <div className="row">
              <h3>{new Date(e.date).toLocaleString()}</h3>
              <Link
                className="text-button"
                href={`/gym/history/${e.workoutId}`}
              >
                {e.routineName} →
              </Link>
            </div>
            {store.history
              .find((w) => w.id === e.workoutId)
              ?.exercises.filter((block) => block.exerciseId === id)
              .map((block, i) => (
                <div key={block.id}>
                  <p className="caption">
                    Block {i + 1} · {block.name} ·{' '}
                    {block.equipment ?? 'Equipment unknown'} ·{' '}
                    {block.primaryMuscleGroup ?? 'Unassigned'} ·{' '}
                    {
                      store.history.find((w) => w.id === e.workoutId)
                        ?.provenance.source
                    }
                  </p>
                  {block.sets
                    .filter((s) => s.completed)
                    .map((s) => (
                      <div key={s.id}>
                        <p className="detail-set">{formatSet(s)}</p>
                        <span className="caption">
                          Set type: {s.setType ?? 'normal'}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            {e.sets.some((s) => !effortKnown(s)) && (
              <p className="caption">
                Effort missing for some sets. Treat comparisons cautiously.
              </p>
            )}
          </section>
        ))
      )}
      {(cloud.cache
        ? (page + 1) * 20 < (total ?? 0)
        : exposures.length > limit) && (
        <button
          className="secondary"
          onClick={() =>
            cloud.cache ? setPage((n) => n + 1) : setLimit((n) => n + 20)
          }
        >
          More exposures
        </button>
      )}
      {cloud.cache && page > 0 && (
        <button onClick={() => setPage((n) => n - 1)}>
          Previous exposures
        </button>
      )}
      <p className="footer-note">
        Historical references, not targets. No load-only performance score.
      </p>
    </>
  );
}
