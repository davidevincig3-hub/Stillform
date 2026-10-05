'use client';
import { newId } from '@/domain/id';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { PageHeading } from './assessment';
import { RecentExercises } from './recent-exercises';
import { ExercisePicker } from './exercise-picker';
import type { GymRoutine, RoutineExercise } from '@/domain/gym';
import { reorderRoutine, saveRoutine } from '@/repositories/gym-storage';
export function RoutineEditor({ id }: { id: string }) {
  const { store, ready } = useWorkout();
  if (!ready) return <p>Loading routines…</p>;
  const routine = store.routines.find((r) => r.id === id);
  if (id !== 'new' && !routine)
    return (
      <section className="card">
        <h1>Routine not found</h1>
        <Link href="/gym">Back to Gym</Link>
      </section>
    );
  return <RoutineForm key={routine?.updatedAt ?? 'new'} initial={routine} />;
}
function RoutineForm({ initial }: { initial?: GymRoutine }) {
  const { store, save } = useWorkout();
  const router = useRouter();
  const [draft, setDraft] = useState<GymRoutine>(
    () =>
      initial ?? {
        id: newId(),
        name: '',
        notes: '',
        exercises: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [exerciseId, setExerciseId] = useState(store.exercises[0]?.id ?? '');
  const [error, setError] = useState('');
  function addExercise(id: string) {
    if (!store.exercises.some((e) => e.id === id)) return;
    setDraft({
      ...draft,
      exercises: [
        ...draft.exercises,
        {
          id: newId(),
          exerciseId: id,
          defaultSets: 3,
          repRange: null,
          notes: '',
        },
      ],
    });
  }
  function edit(id: string, patch: Partial<RoutineExercise>) {
    setDraft({
      ...draft,
      exercises: draft.exercises.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    });
  }
  return (
    <>
      <Link className="text-button" href="/gym">
        ← Gym
      </Link>
      <PageHeading
        title={initial ? 'Edit routine' : 'Create routine'}
        subtitle="Structure your session. Weights stay blank until you log them."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (save(saveRoutine(store, draft))) router.push('/gym');
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Routine could not be saved',
            );
          }
        }}
      >
        <section className="card">
          <label htmlFor="routine-name">Routine name</label>
          <input
            id="routine-name"
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label htmlFor="routine-notes">Routine notes · optional</label>
          <textarea
            id="routine-notes"
            maxLength={2000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </section>
        <RecentExercises compact onAdd={addExercise} />
        {draft.exercises.map((entry, index) => {
          const exercise = store.exercises.find(
            (e) => e.id === entry.exerciseId,
          )!;
          return (
            <section className="card" key={entry.id}>
              <div className="row">
                <h2>
                  {index + 1}. {exercise.name}
                </h2>
                <div className="row compact">
                  <button
                    type="button"
                    className="secondary compact"
                    aria-label={`Move ${exercise.name} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setDraft(reorderRoutine(draft, index, index - 1))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary compact"
                    aria-label={`Move ${exercise.name} down`}
                    disabled={index === draft.exercises.length - 1}
                    onClick={() =>
                      setDraft(reorderRoutine(draft, index, index + 1))
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    aria-label={`Remove ${exercise.name} from routine`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        exercises: draft.exercises.filter(
                          (e) => e.id !== entry.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="routine-fields">
                <label>
                  Default sets
                  <input
                    aria-label={`${exercise.name} default sets`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={entry.defaultSets}
                    onChange={(e) =>
                      edit(entry.id, { defaultSets: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Min reps · optional
                  <input
                    aria-label={`${exercise.name} minimum reps`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    value={entry.repRange?.min ?? ''}
                    onChange={(e) =>
                      edit(entry.id, {
                        repRange: e.target.value
                          ? {
                              min: Number(e.target.value),
                              max:
                                entry.repRange?.max ?? Number(e.target.value),
                            }
                          : null,
                      })
                    }
                  />
                </label>
                <label>
                  Max reps · optional
                  <input
                    aria-label={`${exercise.name} maximum reps`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    value={entry.repRange?.max ?? ''}
                    onChange={(e) =>
                      edit(entry.id, {
                        repRange: e.target.value
                          ? {
                              min: entry.repRange?.min ?? 1,
                              max: Number(e.target.value),
                            }
                          : null,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Exercise notes · optional
                <textarea
                  aria-label={`${exercise.name} routine notes`}
                  maxLength={2000}
                  value={entry.notes}
                  onChange={(e) => edit(entry.id, { notes: e.target.value })}
                />
              </label>
            </section>
          );
        })}
        <section className="card">
          <ExercisePicker
            id="routine-exercise"
            label="Exercise library"
            value={exerciseId}
            onChange={setExerciseId}
          />
          <div className="row start">
            <button
              type="button"
              className="secondary"
              disabled={!exerciseId}
              onClick={() => addExercise(exerciseId)}
            >
              Add to routine
            </button>
            <Link className="text-button" href="/gym/exercises">
              Manage exercise library →
            </Link>
          </div>
          <p className="caption">
            Save your routine before leaving to create an exercise.
          </p>
        </section>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit">
          Save routine
        </button>
      </form>
    </>
  );
}
