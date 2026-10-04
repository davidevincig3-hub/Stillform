'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { PreviousPerformance } from './previous-performance';
import { blankSet } from '@/repositories/workout-storage';
import {
  finishGymWorkout,
  workoutExercise,
  confirmLegacyWorkout,
} from '@/repositories/gym-storage';
import { type WorkoutSet } from '@/domain/models';
import type { GymWorkout } from '@/domain/gym';
import { editGymSet, toggleGymSet } from '@/domain/gym-workout';
export function ActiveWorkoutScreen() {
  const { store, ready, save } = useWorkout();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [discard, setDiscard] = useState(false);
  const [selectedExercise, setSelectedExercise] =
    useState('builtin-calf-raise');
  const active = store.active;
  if (!ready) return <p>Loading saved workout…</p>;
  if (!active)
    return (
      <section className="card">
        <h1>No active workout</h1>
        <Link className="primary" href="/gym">
          Choose a routine
        </Link>
      </section>
    );
  function update(session: GymWorkout) {
    return save({ ...store, active: session });
  }
  function changeSet(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) {
    if (active) update(editGymSet(active, exerciseId, setId, patch));
  }
  function done(exerciseId: string, setId: string) {
    if (!active) return;
    try {
      update(toggleGymSet(active, exerciseId, setId));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to log set');
    }
  }
  return (
    <div className="gym-active">
      <div className="row workout-header">
        <div>
          <p className="eyebrow">Active workout · real local log</p>
          <h1>{active.routineName}</h1>
          <p className="caption">
            Started{' '}
            {new Date(active.startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Link className="secondary" href="/gym">
          Leave workout →
        </Link>
      </div>
      {active.dataOrigin === 'legacy_unverified' && (
        <section className="notice">
          <p>
            This V1 session is preserved but excluded from personal queries
            until reviewed.
          </p>
          <button
            className="secondary"
            onClick={() => save(confirmLegacyWorkout(store, active.id))}
          >
            Confirm this is my real workout
          </button>
        </section>
      )}
      {message && (
        <p role="alert" className="notice">
          {message}
        </p>
      )}
      {active.exercises.map((e) => (
        <section className="card workout-exercise" key={e.id}>
          <div className="row">
            <div>
              <h2>{e.name}</h2>
              <p className="caption">
                {e.primaryMuscleGroup}
                {e.repRange
                  ? ` · ${e.repRange.min}–${e.repRange.max} reps`
                  : ''}
              </p>
            </div>
            <button
              className="text-button"
              aria-label={`Remove ${e.name} exercise`}
              onClick={() =>
                update({
                  ...active,
                  exercises: active.exercises.filter((x) => x.id !== e.id),
                })
              }
            >
              Remove
            </button>
          </div>
          <PreviousPerformance exerciseId={e.exerciseId} />
          {e.notes && <p className="caption">{e.notes}</p>}
          <div className="set-table">
            <div className="set-row set-head">
              <span>Set</span>
              <span>kg</span>
              <span>Reps</span>
              <span>RIR</span>
              <span>Done</span>
              <span />
            </div>
            {e.sets.map((s, i) => (
              <div
                className={`set-block ${s.completed ? 'logged' : ''}`}
                key={s.id}
              >
                <div className="set-row">
                  <span>{i + 1}</span>
                  {(['weight', 'reps', 'rir'] as const).map((field) => (
                    <input
                      key={field}
                      aria-label={`${e.name} set ${i + 1} ${field}`}
                      type="number"
                      inputMode={field === 'reps' ? 'numeric' : 'decimal'}
                      min={field === 'reps' ? 1 : 0}
                      max={
                        field === 'weight' ? 1000 : field === 'reps' ? 200 : 10
                      }
                      step={field === 'reps' ? 1 : 0.5}
                      placeholder="—"
                      value={s[field] ?? ''}
                      onChange={(event) =>
                        changeSet(e.id, s.id, {
                          [field]:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  ))}
                  <button
                    className="set-check"
                    aria-label={`${s.completed ? 'Unlog' : 'Log'} ${e.name} set ${i + 1}`}
                    aria-pressed={s.completed}
                    onClick={() => done(e.id, s.id)}
                  >
                    {s.completed ? '✓' : 'Done'}
                  </button>
                  <button
                    className="set-delete"
                    aria-label={`Remove ${e.name} set ${i + 1}`}
                    onClick={() =>
                      update({
                        ...active,
                        exercises: active.exercises.map((x) =>
                          x.id === e.id
                            ? {
                                ...x,
                                sets: x.sets.filter((y) => y.id !== s.id),
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
                <details className="effort">
                  <summary>Optional RPE / failure</summary>
                  <label>
                    RPE
                    <input
                      aria-label={`${e.name} set ${i + 1} RPE`}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={10}
                      step={0.5}
                      value={s.rpe ?? ''}
                      onChange={(event) =>
                        changeSet(e.id, s.id, {
                          rpe:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.failure}
                      onChange={(event) =>
                        changeSet(e.id, s.id, { failure: event.target.checked })
                      }
                    />{' '}
                    Reached failure
                  </label>
                </details>
              </div>
            ))}
          </div>
          <button
            className="secondary"
            onClick={() =>
              update({
                ...active,
                exercises: active.exercises.map((x) =>
                  x.id === e.id ? { ...x, sets: [...x.sets, blankSet()] } : x,
                ),
              })
            }
          >
            + Add set
          </button>
        </section>
      ))}
      <section className="card">
        <label htmlFor="workout-exercise">Add an exercise</label>
        <div className="row start">
          <select
            id="workout-exercise"
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
          >
            {store.exercises.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={() => {
              const exercise = store.exercises.find(
                (e) => e.id === selectedExercise,
              );
              if (exercise)
                update({
                  ...active,
                  exercises: [...active.exercises, workoutExercise(exercise)],
                });
            }}
          >
            + Add exercise
          </button>
        </div>
        <details>
          <summary>Workout notes · optional</summary>
          <textarea
            aria-label="Workout notes"
            maxLength={4000}
            value={active.notes}
            onChange={(e) => update({ ...active, notes: e.target.value })}
          />
        </details>
      </section>
      <div className="row start workout-finish">
        <button
          className="primary"
          onClick={() => {
            try {
              if (save(finishGymWorkout(store))) router.push('/gym');
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : 'Unable to finish',
              );
            }
          }}
        >
          Finish workout
        </button>
        <button className="secondary danger" onClick={() => setDiscard(true)}>
          Discard workout
        </button>
      </div>
      {discard && (
        <section className="notice">
          <p>Discard this active session and its logged sets?</p>
          <div className="row start">
            <button className="secondary" onClick={() => setDiscard(false)}>
              Keep workout
            </button>
            <button
              className="secondary danger"
              onClick={() => {
                if (save({ ...store, active: null })) router.push('/gym');
              }}
            >
              Confirm discard
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
