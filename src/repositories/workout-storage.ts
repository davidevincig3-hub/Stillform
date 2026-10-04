import {
  setSchema,
  workoutSchema,
  type GymSession,
  type Routine,
  type WorkoutSet,
} from '../domain/models';
import { z } from 'zod';
export const workoutStoreSchema = z
  .object({
    version: z.literal(1),
    active: workoutSchema.nullable(),
    history: z.array(workoutSchema),
  })
  .refine(
    (store) =>
      (!store.active || store.active.status === 'active') &&
      store.history.every((session) => session.status === 'completed'),
    'Stored sessions must match their lifecycle state',
  );
export type WorkoutStore = z.infer<typeof workoutStoreSchema>;
export const emptyStore: WorkoutStore = {
  version: 1,
  active: null,
  history: [],
};
export const storageKey = 'adaptive-coach.workouts.v1';
export function blankSet(): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    weight: null,
    reps: null,
    rir: null,
    rpe: null,
    failure: false,
    completed: false,
    loggedAt: null,
  };
}
export function startWorkout(routine: Routine): GymSession {
  return {
    id: crypto.randomUUID(),
    routineName: routine.name,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'active',
    exercises: routine.exercises.map((e) => ({
      id: crypto.randomUUID(),
      name: e.name,
      muscleGroup: e.muscleGroup,
      previous: e.previous,
      sets: Array.from({ length: e.setCount }, blankSet),
    })),
  };
}
export function finishWorkout(store: WorkoutStore): WorkoutStore {
  workoutStoreSchema.parse(store);
  if (!store.active) return store;
  if (
    !store.active.exercises.some((e) =>
      e.sets.some((s) => s.completed && s.reps !== null),
    )
  )
    throw new Error('Log at least one completed set before finishing.');
  return {
    ...store,
    active: null,
    history: [
      {
        ...store.active,
        status: 'completed',
        endedAt: new Date().toISOString(),
      },
      ...store.history,
    ],
  };
}
export function parseStore(raw: string): WorkoutStore {
  return workoutStoreSchema.parse(JSON.parse(raw));
}

export function editWorkoutSet(
  session: GymSession,
  exerciseId: string,
  setId: string,
  patch: Partial<WorkoutSet>,
): GymSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            sets: exercise.sets.map((set) =>
              set.id === setId
                ? { ...set, ...patch, completed: false, loggedAt: null }
                : set,
            ),
          }
        : exercise,
    ),
  };
}
export function toggleSetCompletion(
  session: GymSession,
  exerciseId: string,
  setId: string,
): GymSession {
  const target = session.exercises
    .find((exercise) => exercise.id === exerciseId)
    ?.sets.find((set) => set.id === setId);
  if (!target || !setSchema.safeParse(target).success || target.reps === null)
    throw new Error(
      'Enter valid reps (1–200), weight (0–1000), and optional RIR (0–10) / RPE (1–10).',
    );
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            sets: exercise.sets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    completed: !set.completed,
                    loggedAt: !set.completed ? new Date().toISOString() : null,
                  }
                : set,
            ),
          }
        : exercise,
    ),
  };
}
