'use client';
import { newId } from '@/domain/id';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeading } from '@/components/assessment';
import { useWorkout } from '@/components/workout-provider';
import { saveCustomExercise } from '@/repositories/gym-storage';
import type { Exercise } from '@/domain/gym';
export default function ExerciseLibrary() {
  const { store, ready } = useWorkout();
  const [edit, setEdit] = useState<Exercise | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Link href="/gym" className="text-button">
        ← Gym
      </Link>
      <PageHeading
        title="Exercise library"
        subtitle="Stable exercise identities. No muscle involvement scores."
      />
      <button
        className="primary"
        disabled={!ready}
        onClick={() => {
          setEdit(null);
          setOpen(true);
        }}
      >
        Create custom exercise
      </button>
      {open && (
        <ExerciseForm
          key={edit?.id ?? 'new'}
          initial={edit}
          close={() => setOpen(false)}
        />
      )}
      <div className="card library-list">
        {store.exercises.map((e) => (
          <div className="history-row" key={e.id}>
            <div>
              <Link href={`/gym/exercises/${encodeURIComponent(e.id)}`}>
                <h3>{e.name}</h3>
              </Link>
              <p className="caption">
                {e.primaryMuscleGroup ?? 'Unassigned'} ·{' '}
                {e.equipment || 'Equipment unspecified'} ·{' '}
                {e.custom ? 'Custom' : 'Built-in'}
              </p>
            </div>
            {e.custom && (
              <button
                className="secondary"
                aria-label={`Edit ${e.name}`}
                onClick={() => {
                  setEdit(e);
                  setOpen(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
function ExerciseForm({
  initial,
  close,
}: {
  initial: Exercise | null;
  close: () => void;
}) {
  const { store, save } = useWorkout();
  const [error, setError] = useState('');
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        try {
          const exercise: Exercise = {
            id: initial?.id ?? newId(),
            name: String(data.get('name')),
            primaryMuscleGroup: String(data.get('muscle') ?? '').trim() || null,
            secondaryMuscleGroups: String(data.get('secondary') ?? '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            equipment: String(data.get('equipment') ?? ''),
            category: String(data.get('category') ?? ''),
            custom: true,
          };
          if (save(saveCustomExercise(store, exercise))) close();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : 'Could not save exercise',
          );
        }
      }}
    >
      <h2>{initial ? 'Edit custom exercise' : 'New custom exercise'}</h2>
      <label htmlFor="custom-name">Exercise name</label>
      <input
        id="custom-name"
        name="name"
        required
        maxLength={120}
        defaultValue={initial?.name}
      />
      <label htmlFor="custom-muscle">Primary muscle group</label>
      <input
        id="custom-muscle"
        name="muscle"
        placeholder="Unassigned"
        maxLength={60}
        defaultValue={initial?.primaryMuscleGroup ?? ''}
      />
      <p className="caption">
        Optional. Leave blank to keep muscle metadata Unassigned.
      </p>
      <label htmlFor="custom-secondary">
        Secondary groups · optional, comma separated
      </label>
      <input
        id="custom-secondary"
        name="secondary"
        maxLength={300}
        defaultValue={initial?.secondaryMuscleGroups.join(', ')}
      />
      <label htmlFor="custom-equipment">Equipment · optional</label>
      <input
        id="custom-equipment"
        name="equipment"
        maxLength={80}
        defaultValue={initial?.equipment ?? ''}
      />
      <label htmlFor="custom-category">Category · optional</label>
      <input
        id="custom-category"
        name="category"
        maxLength={80}
        defaultValue={initial?.category ?? ''}
      />
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="row start">
        <button className="primary">Save exercise</button>
        <button className="secondary" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
