import type { GymWorkoutExercise } from '../domain/gym';
import { effortKnown } from './gym';

// Recovery's existing first-set protocol. Do not substitute a later/best set.
export function comparableFirstSet(exercise: GymWorkoutExercise) {
  const set = exercise.sets[0];
  if (
    !set?.completed ||
    set.weight === null ||
    set.weight <= 0 ||
    set.reps === null ||
    set.reps <= 0 ||
    !effortKnown(set) ||
    (set.setType && !['normal', 'failure'].includes(set.setType))
  )
    return null;
  return {
    set,
    key: JSON.stringify([
      exercise.exerciseId,
      exercise.equipment ?? null,
      set.reps,
      set.rir,
      set.rpe,
      set.failure,
    ]),
  };
}
