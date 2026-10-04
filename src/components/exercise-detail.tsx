'use client';
import Link from 'next/link';
import { useWorkout } from './workout-provider';
import { exerciseExposures, effortKnown, formatSet } from '@/analytics/gym';
import { PageHeading } from './assessment';
export function ExerciseDetail({ id }: { id: string }) {
  const { store, ready } = useWorkout();
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
        subtitle={`${exercise.primaryMuscleGroup} · ${exercise.equipment ?? 'Equipment unspecified'} · Real exposure history`}
      />
      {!exposures.length ? (
        <section className="card">
          <h3>No completed exposures yet</h3>
          <p className="muted">
            Log this exercise to build history. Sample performances are never
            used.
          </p>
        </section>
      ) : (
        exposures.map((e) => (
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
            {e.sets.map((s) => (
              <p className="detail-set" key={s.id}>
                {formatSet(s)}
              </p>
            ))}
            {e.sets.some((s) => !effortKnown(s)) && (
              <p className="caption">
                Effort missing for some sets. Treat comparisons cautiously.
              </p>
            )}
          </section>
        ))
      )}
      <p className="footer-note">
        Historical references, not targets. No load-only performance score.
      </p>
    </>
  );
}
