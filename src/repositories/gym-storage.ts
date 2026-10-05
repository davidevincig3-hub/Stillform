import { newId } from '../domain/id';
import { z } from 'zod';
import {
  builtInExercises,
  libraryExerciseSchema,
  gymRoutineSchema,
  gymWorkoutSchema,
  type GymRoutine,
  type GymWorkout,
  type Exercise,
} from '../domain/gym';
import {
  parseStore as parseLegacy,
  storageKey as legacyStorageKey,
  blankSet,
} from './workout-storage';
import type { GymSession } from '../domain/models';
export { legacyStorageKey };
export const gymStorageKey = 'adaptive-coach.gym.v2';
export const gymStoreSchema = z
  .object({
    version: z.literal(2),
    schemaRevision: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .default(3)
      .transform(() => 3 as const),
    exercisePreferences: z
      .record(
        z.string(),
        z.object({ pinned: z.boolean(), dismissed: z.boolean() }),
      )
      .default({}),
    exercises: z.array(libraryExerciseSchema),
    routines: z.array(gymRoutineSchema),
    active: gymWorkoutSchema.nullable(),
    history: z.array(gymWorkoutSchema),
    legacyArchive: z.array(gymWorkoutSchema),
    hevyMappings: z.record(z.string(), z.string()).default({}),
    importBatches: z
      .array(
        z.object({
          id: z.string(),
          importedAt: z.iso.datetime(),
          source: z.literal('hevy_import'),
          workouts: z.number().int().nonnegative(),
          sets: z.number().int().nonnegative(),
          duplicates: z.number().int().nonnegative(),
          skippedSets: z.number().int().nonnegative().default(0),
          customExercises: z.number().int().nonnegative(),
          warnings: z.array(z.string()),
          timeZone: z.string(),
        }),
      )
      .default([]),
  })
  .superRefine((s, ctx) => {
    if (s.active?.status === 'completed' || s.active?.dataOrigin === 'demo')
      ctx.addIssue({ code: 'custom', message: 'Invalid active workout' });
    for (const w of s.history)
      if (w.status !== 'completed' || w.dataOrigin !== 'user')
        ctx.addIssue({
          code: 'custom',
          message: 'Real history only accepts confirmed user workouts',
        });
    for (const w of s.legacyArchive)
      if (w.status !== 'completed' || w.dataOrigin !== 'legacy_unverified')
        ctx.addIssue({ code: 'custom', message: 'Invalid legacy archive' });
    for (const rows of [
      s.exercises,
      s.routines,
      [...s.history, ...s.legacyArchive, ...(s.active ? [s.active] : [])],
    ])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
    for (const r of s.routines)
      for (const e of r.exercises)
        if (!s.exercises.some((x) => x.id === e.exerciseId))
          ctx.addIssue({
            code: 'custom',
            message: 'Routine references unknown exercise',
          });
    const fingerprints = s.history
      .map((w) => w.provenance.fingerprint)
      .filter(Boolean);
    if (new Set(fingerprints).size !== fingerprints.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate source fingerprints',
      });
    for (const id of Object.values(s.hevyMappings))
      if (!s.exercises.some((e) => e.id === id))
        ctx.addIssue({
          code: 'custom',
          message: 'Mapping references unknown exercise',
        });
    for (const id of Object.keys(s.exercisePreferences))
      if (!s.exercises.some((e) => e.id === id))
        ctx.addIssue({
          code: 'custom',
          message: 'Preference references unknown exercise',
        });
  });
export type GymStore = z.infer<typeof gymStoreSchema>;
export function setExercisePreference(
  store: GymStore,
  id: string,
  patch: Partial<GymStore['exercisePreferences'][string]>,
) {
  if (!store.exercises.some((e) => e.id === id))
    throw new Error('Exercise not found');
  return gymStoreSchema.parse({
    ...store,
    exercisePreferences: {
      ...store.exercisePreferences,
      [id]: {
        ...(store.exercisePreferences[id] ?? {
          pinned: false,
          dismissed: false,
        }),
        ...patch,
      },
    },
  });
}
export function initialGymStore(): GymStore {
  return {
    version: 2,
    schemaRevision: 3,
    exercisePreferences: {},
    exercises: structuredClone(builtInExercises),
    routines: [],
    active: null,
    history: [],
    legacyArchive: [],
    hevyMappings: {},
    importBatches: [],
  };
}
export function parseGymStore(raw: string): GymStore {
  return gymStoreSchema.parse(JSON.parse(raw));
}
export function migrateLegacyStore(raw: string): GymStore {
  const old = parseLegacy(raw);
  const next = initialGymStore();
  function migrate(session: GymSession): GymWorkout {
    return {
      id: session.id,
      routineId: null,
      routineName: session.routineName,
      routineSnapshot: null,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMinutes:
        session.status === 'completed' && session.endedAt
          ? Math.max(
              0,
              (Date.parse(session.endedAt ?? session.startedAt) -
                Date.parse(session.startedAt)) /
                60000,
            )
          : null,
      status: session.status,
      notes: 'Migrated from V1; personal data status needs review.',
      dataOrigin: 'legacy_unverified',
      provenance: { source: 'legacy_v1', recordedAt: session.startedAt },
      exercises: session.exercises.map((e) => {
        let match = next.exercises.find(
          (x) => x.name.toLowerCase() === e.name.toLowerCase(),
        );
        if (!match) {
          match = {
            id: `legacy-${e.id}`,
            name: e.name,
            primaryMuscleGroup: e.muscleGroup || null,
            secondaryMuscleGroups: [],
            custom: true,
          };
          next.exercises.push(match);
        }
        return {
          id: e.id,
          exerciseId: match.id,
          name: e.name,
          primaryMuscleGroup: match.primaryMuscleGroup,
          secondaryMuscleGroups: [],
          notes: '',
          repRange: null,
          sets: e.sets,
          equipment: match.equipment,
        };
      }),
    };
  }
  next.active = old.active ? migrate(old.active) : null;
  next.legacyArchive = old.history.map(migrate);
  return gymStoreSchema.parse(next);
}
export function loadGymStore(
  raw: string | null,
  legacy: string | null,
): GymStore {
  return raw !== null
    ? parseGymStore(raw)
    : legacy
      ? migrateLegacyStore(legacy)
      : initialGymStore();
}
export function saveRoutine(store: GymStore, routine: GymRoutine): GymStore {
  const parsed = gymRoutineSchema.parse({
    ...routine,
    updatedAt: new Date().toISOString(),
  });
  return gymStoreSchema.parse({
    ...store,
    routines: store.routines.some((r) => r.id === parsed.id)
      ? store.routines.map((r) => (r.id === parsed.id ? parsed : r))
      : [...store.routines, parsed],
  });
}
export function deleteRoutine(store: GymStore, id: string): GymStore {
  return { ...store, routines: store.routines.filter((r) => r.id !== id) };
}
export function duplicateRoutine(store: GymStore, id: string): GymStore {
  const original = store.routines.find((r) => r.id === id);
  if (!original) throw new Error('Routine not found');
  const now = new Date().toISOString();
  return saveRoutine(store, {
    ...original,
    id: newId(),
    name: `${original.name.slice(0, 110)} copy`,
    createdAt: now,
    updatedAt: now,
    exercises: original.exercises.map((e) => ({
      ...e,
      id: newId(),
    })),
  });
}
export function reorderRoutine(
  routine: GymRoutine,
  from: number,
  to: number,
): GymRoutine {
  if (
    from < 0 ||
    to < 0 ||
    from >= routine.exercises.length ||
    to >= routine.exercises.length
  )
    return routine;
  const exercises = [...routine.exercises];
  const [entry] = exercises.splice(from, 1);
  exercises.splice(to, 0, entry);
  return { ...routine, exercises };
}
export function saveCustomExercise(
  store: GymStore,
  exercise: Exercise,
): GymStore {
  if (
    !exercise.custom ||
    store.exercises.some((e) => e.id === exercise.id && !e.custom)
  )
    throw new Error('Built-in exercises cannot be edited');
  const parsed = libraryExerciseSchema.parse(exercise);
  return {
    ...store,
    exercises: store.exercises.some((e) => e.id === parsed.id)
      ? store.exercises.map((e) => (e.id === parsed.id ? parsed : e))
      : [...store.exercises, parsed],
  };
}
export function workoutExercise(exercise: Exercise, sets = 1) {
  return {
    id: newId(),
    exerciseId: exercise.id,
    name: exercise.name,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: [...exercise.secondaryMuscleGroups],
    equipment: exercise.equipment,
    repRange: null,
    notes: '',
    sets: Array.from({ length: sets }, blankSet),
  };
}
export function startGymWorkout(
  store: GymStore,
  routine: GymRoutine,
): GymStore {
  if (store.active) throw new Error('A workout is already active');
  if (!routine.exercises.length)
    throw new Error('Add at least one exercise to this routine');
  const now = new Date().toISOString();
  return gymStoreSchema.parse({
    ...store,
    active: {
      id: newId(),
      routineId: routine.id,
      routineName: routine.name,
      routineSnapshot: structuredClone(routine),
      startedAt: now,
      endedAt: null,
      durationMinutes: null,
      status: 'active',
      dataOrigin: 'user',
      provenance: { source: 'local_logger', recordedAt: now },
      notes: '',
      exercises: routine.exercises.map((e) => {
        const exercise = store.exercises.find((x) => x.id === e.exerciseId);
        if (!exercise) throw new Error('Exercise not found');
        return {
          ...workoutExercise(exercise, e.defaultSets),
          notes: e.notes,
          repRange: e.repRange,
        };
      }),
    },
  });
}
export function finishGymWorkout(
  store: GymStore,
  finishedAt = new Date().toISOString(),
): GymStore {
  if (!store.active) throw new Error('No active workout');
  if (
    !store.active.exercises.some((e) =>
      e.sets.some((s) => s.completed && s.reps !== null),
    )
  )
    throw new Error('Log at least one completed set before finishing.');
  const session = {
    ...store.active,
    status: 'completed' as const,
    endedAt: finishedAt,
    durationMinutes: Math.max(
      0,
      (Date.parse(finishedAt) - Date.parse(store.active.startedAt)) / 60000,
    ),
  };
  return gymStoreSchema.parse({
    ...store,
    active: null,
    history:
      session.dataOrigin === 'user'
        ? [session, ...store.history]
        : store.history,
    legacyArchive:
      session.dataOrigin === 'legacy_unverified'
        ? [session, ...store.legacyArchive]
        : store.legacyArchive,
  });
}
export function confirmLegacyWorkout(store: GymStore, id: string): GymStore {
  const session = store.legacyArchive.find((w) => w.id === id);
  if (session)
    return gymStoreSchema.parse({
      ...store,
      legacyArchive: store.legacyArchive.filter((w) => w.id !== id),
      history: [{ ...session, dataOrigin: 'user' }, ...store.history],
    });
  if (store.active?.id === id)
    return { ...store, active: { ...store.active, dataOrigin: 'user' } };
  throw new Error('Legacy workout not found');
}
