'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import { recentExercises } from '@/analytics/gym-shortlist';
import { setExercisePreference } from '@/repositories/gym-storage';
export function ExercisePicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { store, save } = useWorkout();
  const [query, setQuery] = useState('');
  const recent = new Set(recentExercises(store).rows.map((r) => r.exercise.id));
  const matched = store.exercises.filter(
    (e) =>
      e.id === value ||
      e.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="exercise-picker">
      <label htmlFor={`${id}-search`}>Search exercise library</label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={store.exercises.some((e) => e.id === value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose an exercise</option>
        <optgroup label="Recent / pinned">
          {matched
            .filter((e) => recent.has(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.primaryMuscleGroup ?? 'Unassigned'}
              </option>
            ))}
        </optgroup>
        <optgroup label="Full library">
          {matched
            .filter((e) => !recent.has(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.primaryMuscleGroup ?? 'Unassigned'}
                {e.custom ? ' · custom' : ''}
              </option>
            ))}
        </optgroup>
      </select>
      {store.exercises.some((e) => e.id === value) && (
        <button
          type="button"
          className="secondary compact"
          onClick={() =>
            save(
              setExercisePreference(store, value, {
                pinned: !store.exercisePreferences[value]?.pinned,
                dismissed: false,
              }),
            )
          }
        >
          {store.exercisePreferences[value]?.pinned
            ? 'Unpin selected exercise'
            : 'Pin selected exercise'}
        </button>
      )}
    </div>
  );
}
