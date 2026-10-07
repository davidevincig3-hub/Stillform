'use client';
import { newId } from '@/domain/id';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { PageHeading } from './assessment';
import { GymHistory } from './gym-history';
import { RecentExercises } from './recent-exercises';
import { GymPerformanceTrend } from './gym-performance-trend';
import { GymAnalytics } from './gym-analytics';
import { GymExportControls } from './gym-export-controls';
import { GymCloudControls } from './gym-cloud-controls';
import { routineTemplates } from '@/domain/gym';
import {
  saveRoutine,
  deleteRoutine,
  duplicateRoutine,
  startGymWorkout,
  confirmLegacyWorkout,
} from '@/repositories/gym-storage';
export function GymDashboard() {
  const { store, save, ready } = useWorkout();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [error, setError] = useState('');
  const chosen =
    store.routines.find((r) => r.id === selected) ?? store.routines[0];
  function run(action: () => boolean) {
    try {
      action();
      setError('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to save change',
      );
    }
  }
  return (
    <>
      <PageHeading
        title="Train. Log. Learn."
        subtitle="Your real workouts. No sample performance in your personal history."
      />
      <GymCloudControls />
      <div className="start-workout">
        {store.active ? (
          <Link className="primary" href="/gym/workout">
            Return to {store.active.routineName} workout →
          </Link>
        ) : (
          <button
            className="primary"
            disabled={!ready || !chosen || !chosen.exercises.length}
            onClick={() =>
              run(() => {
                if (chosen && save(startGymWorkout(store, chosen))) {
                  router.push('/gym/workout');
                  return true;
                }
                return false;
              })
            }
          >
            Start Workout →
          </button>
        )}
        <span className="caption">
          Blank weights · Optional effort · HR not required
        </span>
      </div>
      <div className="section-heading">
        <h2>Your routines</h2>
        <Link href="/gym/routines/new" className="primary">
          Create routine
        </Link>
      </div>
      <div className="row start">
        <Link className="text-button" href="/gym/exercises">
          Exercise library →
        </Link>
        <span className="tag">Real local data</span>
        <Link className="text-button" href="/activities">
          All activities & Strava →
        </Link>
      </div>
      {!store.routines.length && (
        <section className="card">
          <h3>Build your first routine</h3>
          <p className="muted">
            Create one from scratch or copy a structure-only template below. No
            historical sets or weights are supplied.
          </p>
        </section>
      )}
      <div className="three-grid">
        {store.routines.map((r) => (
          <section
            key={r.id}
            className={`card routine-card ${chosen?.id === r.id ? 'selected' : ''}`}
          >
            <button
              className="routine-select"
              aria-label={`Select ${r.name}`}
              aria-pressed={chosen?.id === r.id}
              onClick={() => setSelected(r.id)}
            >
              <p className="eyebrow">{r.exercises.length} exercises</p>
              <h2>{r.name}</h2>
              <p className="caption">
                {r.exercises
                  .map(
                    (e) =>
                      store.exercises.find((x) => x.id === e.exerciseId)?.name,
                  )
                  .join(' · ')}
              </p>
            </button>
            <div className="row start routine-actions">
              <Link className="text-button" href={`/gym/routines/${r.id}`}>
                Edit {r.name}
              </Link>
              <button
                className="text-button"
                aria-label={`Duplicate ${r.name}`}
                onClick={() => run(() => save(duplicateRoutine(store, r.id)))}
              >
                Duplicate
              </button>
              <button
                className="text-button danger"
                aria-label={`Delete ${r.name} routine`}
                onClick={() => setRemove(r.id)}
              >
                Delete
              </button>
            </div>
          </section>
        ))}
      </div>
      {remove && (
        <section className="notice">
          <p>
            Delete this routine? Completed and active workout snapshots are
            preserved.
          </p>
          <div className="row start">
            <button className="secondary" onClick={() => setRemove(null)}>
              Cancel deletion
            </button>
            <button
              className="secondary danger"
              onClick={() => {
                if (save(deleteRoutine(store, remove))) setRemove(null);
              }}
            >
              Confirm delete routine
            </button>
          </div>
        </section>
      )}
      <details className="card">
        <summary>Routine templates · structure only</summary>
        <p className="muted">
          These examples are not personal workouts. Copying creates an editable
          routine with no sample sets, loads or previous performances.
        </p>
        <div className="row start">
          {routineTemplates.map((t) => (
            <button
              key={t.name}
              className="secondary"
              disabled={!ready}
              onClick={() =>
                run(() => {
                  const now = new Date().toISOString();
                  const id = newId();
                  const result = save(
                    saveRoutine(store, {
                      id,
                      name: t.name,
                      notes: '',
                      createdAt: now,
                      updatedAt: now,
                      exercises: t.exerciseIds.map((exerciseId) => ({
                        id: newId(),
                        exerciseId,
                        defaultSets: 3,
                        repRange: null,
                        notes: '',
                      })),
                    }),
                  );
                  if (result) setSelected(id);
                  return result;
                })
              }
            >
              Use {t.name} template
            </button>
          ))}
        </div>
      </details>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <RecentExercises />
      <GymHistory />
      <GymPerformanceTrend />
      <details className="card">
        <summary>Descriptive analytics</summary>
        <GymAnalytics />
      </details>
      {store.legacyArchive.length > 0 && (
        <section className="card">
          <h2>Older V1 records · review required</h2>
          <p className="muted">
            Excluded from real history and analytics until you confirm that
            these are your actual workouts. Sample previous-performance text has
            been removed.
          </p>
          {store.legacyArchive.map((w) => (
            <details key={w.id}>
              <summary>
                {w.routineName} · {new Date(w.startedAt).toLocaleString()}
              </summary>
              {w.exercises.map((e) => (
                <p key={e.id}>
                  {e.name}:{' '}
                  {e.sets
                    .filter((s) => s.completed)
                    .map((s) => `${s.weight ?? 'Bodyweight'} × ${s.reps}`)
                    .join(', ')}
                </p>
              ))}
              <button
                className="secondary"
                onClick={() => save(confirmLegacyWorkout(store, w.id))}
              >
                Confirm this is my real workout
              </button>
            </details>
          ))}
        </section>
      )}
      <GymExportControls />
    </>
  );
}
