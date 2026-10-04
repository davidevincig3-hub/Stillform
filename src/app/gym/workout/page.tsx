'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkout } from '@/components/workout-provider';
import {
  blankSet,
  finishWorkout,
  editWorkoutSet,
  toggleSetCompletion,
} from '@/repositories/workout-storage';
import { type GymSession, type WorkoutSet } from '@/domain/models';
export default function Workout() {
  const { store, ready, save } = useWorkout();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [discard, setDiscard] = useState(false);
  const [name, setName] = useState('');
  if (!ready) return <p>Loading saved workout…</p>;
  const active = store.active;
  if (!active)
    return (
      <section className="card">
        <h1>No active workout</h1>
        <Link className="primary" href="/gym">
          Choose a routine
        </Link>
      </section>
    );
  function update(next: GymSession) {
    save({ ...store, active: next });
  }
  function setField(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) {
    if (active) update(editWorkoutSet(active, exerciseId, setId, patch));
  }
  function complete(exerciseId: string, setId: string) {
    if (!active) return;
    try {
      update(toggleSetCompletion(active, exerciseId, setId));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to log set.');
    }
  }
  return (
    <>
      <div className="row workout-header">
        <div>
          <p className="eyebrow">Active workout · saved in this browser</p>
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
      <p className="muted">
        Your session stays active when you leave. Previous performances are
        sample references, not target loads.
      </p>
      {message && (
        <p role="alert" className="notice">
          {message}
        </p>
      )}
      {active.exercises.map((e) => (
        <section className="card" key={e.id}>
          <div className="row">
            <div>
              <h2>{e.name}</h2>
              <p className="caption">Previous comparable: {e.previous}</p>
            </div>
            <button
              className="text-button"
              onClick={() =>
                update({
                  ...active,
                  exercises: active.exercises.filter((x) => x.id !== e.id),
                })
              }
            >
              Remove exercise
            </button>
          </div>
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
                key={s.id}
                className={`set-block ${s.completed ? 'logged' : ''}`}
              >
                <div className="set-row">
                  <span>{i + 1}</span>
                  {(['weight', 'reps', 'rir'] as const).map((field) => (
                    <input
                      key={field}
                      aria-label={`${e.name} set ${i + 1} ${field}`}
                      type="number"
                      inputMode="decimal"
                      min={field === 'reps' ? 1 : 0}
                      max={
                        field === 'weight' ? 1000 : field === 'reps' ? 200 : 10
                      }
                      step={field === 'reps' ? 1 : 0.5}
                      placeholder="—"
                      value={s[field] ?? ''}
                      onChange={(event) =>
                        setField(e.id, s.id, {
                          [field]:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  ))}
                  <button
                    aria-label={`${s.completed ? 'Unlog' : 'Log'} ${e.name} set ${i + 1}`}
                    className="set-check"
                    aria-pressed={s.completed}
                    onClick={() => complete(e.id, s.id)}
                  >
                    {s.completed ? '✓' : '○'}
                  </button>
                  <button
                    aria-label={`Remove ${e.name} set ${i + 1}`}
                    className="text-button"
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
                    RPE{' '}
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      value={s.rpe ?? ''}
                      onChange={(event) =>
                        setField(e.id, s.id, {
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
                        setField(e.id, s.id, { failure: event.target.checked })
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
      <form
        className="card row start"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          update({
            ...active,
            exercises: [
              ...active.exercises,
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                muscleGroup: 'Unassigned',
                previous: 'No comparable exposure',
                sets: [blankSet()],
              },
            ],
          });
          setName('');
        }}
      >
        <label htmlFor="exercise-name">Add an exercise</label>
        <input
          id="exercise-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="Exercise name"
        />
        <button className="secondary">+ Add exercise</button>
      </form>
      <div className="row start">
        <button
          className="primary"
          onClick={() => {
            try {
              const next = finishWorkout(store);
              if (save(next)) router.push('/gym');
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : 'Unable to finish.',
              );
            }
          }}
        >
          Finish workout
        </button>
        <button className="text-button danger" onClick={() => setDiscard(true)}>
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
      <p className="footer-note">
        Recommendations will be suggestions. You stay in control.
      </p>
    </>
  );
}
