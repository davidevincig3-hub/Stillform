import { setSchema, type WorkoutSet } from './models';
import type { GymWorkout } from './gym';
export function editGymSet(
  session: GymWorkout,
  exerciseId: string,
  setId: string,
  patch: Partial<WorkoutSet>,
): GymWorkout {
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.id === exerciseId
        ? {
            ...e,
            sets: e.sets.map((s) =>
              s.id === setId
                ? { ...s, ...patch, completed: false, loggedAt: null }
                : s,
            ),
          }
        : e,
    ),
  };
}
export function toggleGymSet(
  session: GymWorkout,
  exerciseId: string,
  setId: string,
): GymWorkout {
  const target = session.exercises
    .find((e) => e.id === exerciseId)
    ?.sets.find((s) => s.id === setId);
  if (!target || !setSchema.safeParse(target).success || target.reps === null)
    throw new Error(
      'Enter valid reps before marking this set done. Effort is optional.',
    );
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.id === exerciseId
        ? {
            ...e,
            sets: e.sets.map((s) =>
              s.id === setId
                ? {
                    ...s,
                    completed: !s.completed,
                    loggedAt: !s.completed ? new Date().toISOString() : null,
                  }
                : s,
            ),
          }
        : e,
    ),
  };
}
