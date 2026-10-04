import {
  initialGymStore,
  gymStoreSchema,
} from '../../src/repositories/gym-storage';
import { gymWorkoutSchema } from '../../src/domain/gym';
export function syntheticGymHistory(count = 30) {
  const store = initialGymStore();
  store.exercises = Array.from({ length: 127 }, (_, i) => ({
    id: `synthetic-ex-${i}`,
    name: `Synthetic exercise ${String(i).padStart(3, '0')}`,
    primaryMuscleGroup: null,
    secondaryMuscleGroups: [],
    custom: true,
  }));
  store.history = Array.from({ length: count }, (_, i) => {
    const startedAt = new Date(Date.UTC(2026, 8, 1 + i, 8)).toISOString(),
      endedAt = new Date(Date.parse(startedAt) + 3600000).toISOString();
    return gymWorkoutSchema.parse({
      id: `synthetic-workout-${i}`,
      routineId: null,
      routineName: `Synthetic workout ${String(i).padStart(3, '0')}`,
      routineSnapshot: null,
      startedAt,
      endedAt,
      durationMinutes: 60,
      status: 'completed',
      dataOrigin: 'user',
      notes: '',
      provenance: { source: 'hevy_import', recordedAt: endedAt },
      exercises: store.exercises
        .filter((_, j) => j % count === i)
        .map((e) => ({
          id: `wx-${i}-${e.id}`,
          exerciseId: e.id,
          name: e.name,
          primaryMuscleGroup: null,
          secondaryMuscleGroups: [],
          notes: '',
          repRange: null,
          sets: [
            {
              id: `set-${i}-${e.id}`,
              weight: 50,
              reps: 10,
              rir: null,
              rpe: null,
              failure: false,
              completed: true,
              loggedAt: null,
            },
          ],
        })),
    });
  });
  return gymStoreSchema.parse(store);
}
