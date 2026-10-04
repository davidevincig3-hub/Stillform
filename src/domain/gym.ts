import { z } from 'zod';
import { setSchema } from './models';

export const libraryExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  primaryMuscleGroup: z.string().trim().min(1).max(60),
  secondaryMuscleGroups: z.array(z.string().min(1)).default([]),
  equipment: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  custom: z.boolean(),
});
export type Exercise = z.infer<typeof libraryExerciseSchema>;
export const routineExerciseSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  defaultSets: z.number().int().min(1).max(30),
  repRange: z
    .object({
      min: z.number().int().min(1).max(200),
      max: z.number().int().min(1).max(200),
    })
    .refine((r) => r.min <= r.max, 'Minimum reps must not exceed maximum reps')
    .nullable()
    .default(null),
  notes: z.string().max(2000).default(''),
});
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;
export const gymSetSchema = setSchema.extend({
  reps: z.number().int().min(0).nullable(),
  setType: z.string().optional(),
  distanceKm: z.number().nonnegative().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  supersetId: z.string().nullable().optional(),
  sourceSetIndex: z.number().int().nonnegative().optional(),
  sourceExerciseNotes: z.string().optional(),
  sourceRowOrder: z.number().int().nonnegative().optional(),
});
export const gymRoutineSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).default(''),
  exercises: z.array(routineExerciseSchema).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GymRoutine = z.infer<typeof gymRoutineSchema>;
export const gymWorkoutExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  name: z.string(),
  primaryMuscleGroup: z.string(),
  secondaryMuscleGroups: z.array(z.string()),
  equipment: z.string().optional(),
  notes: z.string(),
  repRange: routineExerciseSchema.shape.repRange,
  sourceName: z.string().optional(),
  sets: z.array(gymSetSchema),
});
export type GymWorkoutExercise = z.infer<typeof gymWorkoutExerciseSchema>;
export const gymWorkoutSchema = z
  .object({
    id: z.string(),
    routineId: z.string().nullable(),
    routineName: z.string(),
    routineSnapshot: gymRoutineSchema.nullable(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    durationMinutes: z.number().nonnegative().nullable(),
    status: z.enum(['active', 'completed']),
    exercises: z.array(gymWorkoutExerciseSchema),
    notes: z.string().max(4000),
    dataOrigin: z.enum(['user', 'legacy_unverified', 'demo']),
    provenance: z.object({
      source: z.enum(['local_logger', 'hevy_import', 'legacy_v1']),
      recordedAt: z.iso.datetime(),
      externalId: z.string().optional(),
      fingerprint: z.string().optional(),
      batchId: z.string().optional(),
      originalTitle: z.string().optional(),
      sourceStart: z.string().optional(),
      sourceEnd: z.string().optional(),
      timeZone: z.string().optional(),
    }),
  })
  .superRefine((s, ctx) => {
    if (
      s.status === 'completed' &&
      s.provenance.source !== 'legacy_v1' &&
      (!s.endedAt || s.durationMinutes === null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Completed workout requires finish time and duration',
      });
    if (s.endedAt && Date.parse(s.endedAt) < Date.parse(s.startedAt))
      ctx.addIssue({
        code: 'custom',
        message: 'Finish time must follow start',
      });
    for (const e of s.exercises)
      for (const set of e.sets)
        if (
          s.provenance.source !== 'hevy_import' &&
          !setSchema.safeParse(set).success
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid locally logged set',
          });
    for (const e of s.exercises)
      for (const set of e.sets)
        if (
          set.completed &&
          set.reps === null &&
          s.provenance.source !== 'hevy_import'
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Completed sets require reps',
          });
  });
export type GymWorkout = z.infer<typeof gymWorkoutSchema>;
export type ActiveWorkout = GymWorkout & { status: 'active' };
export type CompletedWorkout = GymWorkout & {
  status: 'completed';
  endedAt: string;
  durationMinutes: number;
};
export type SetEffort = Pick<
  z.infer<typeof setSchema>,
  'rir' | 'rpe' | 'failure'
>;

export const builtInExercises: Exercise[] = [
  ['chest-press', 'Chest press', 'Chest', 'Machine'],
  ['shoulder-press', 'Shoulder press', 'Shoulders', 'Dumbbell'],
  ['triceps-extension', 'Triceps extension', 'Triceps', 'Cable'],
  ['lat-pulldown', 'Lat pulldown', 'Back', 'Cable'],
  ['cable-row', 'Cable row', 'Back', 'Cable'],
  ['leg-press', 'Leg press', 'Quads', 'Machine'],
  ['leg-curl', 'Leg curl', 'Hamstrings', 'Machine'],
  ['calf-raise', 'Calf raise', 'Calves', 'Machine'],
  ['squat', 'Squat', 'Quads', 'Barbell'],
  ['romanian-deadlift', 'Romanian deadlift', 'Hamstrings', 'Barbell'],
  ['biceps-curl', 'Biceps curl', 'Biceps', 'Dumbbell'],
  ['lateral-raise', 'Lateral raise', 'Shoulders', 'Dumbbell'],
].map(([id, name, primaryMuscleGroup, equipment]) => ({
  id: `builtin-${id}`,
  name,
  primaryMuscleGroup,
  equipment,
  secondaryMuscleGroups: [],
  custom: false,
}));
export const routineTemplates = [
  {
    name: 'Push',
    exerciseIds: [
      'builtin-chest-press',
      'builtin-shoulder-press',
      'builtin-triceps-extension',
    ],
  },
  {
    name: 'Pull',
    exerciseIds: [
      'builtin-lat-pulldown',
      'builtin-cable-row',
      'builtin-biceps-curl',
    ],
  },
  {
    name: 'Legs',
    exerciseIds: [
      'builtin-leg-press',
      'builtin-leg-curl',
      'builtin-calf-raise',
    ],
  },
];
