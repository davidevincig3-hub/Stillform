import { z } from 'zod';
import { gymStoreSchema, type GymStore } from './gym-storage';

export const cloudTables = [
  'exercises',
  'routines',
  'routine_exercises',
  'workouts',
  'workout_exercises',
  'sets',
  'preferences',
  'mappings',
  'batches',
] as const;
export type CloudTable = (typeof cloudTables)[number];
const rowSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  position: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
});
export const cloudDocumentSchema = z.object({
  formatVersion: z.literal(1),
  tables: z.object(
    Object.fromEntries(
      cloudTables.map((t) => [t, z.array(rowSchema)]),
    ) as Record<CloudTable, z.ZodArray<typeof rowSchema>>,
  ),
});
export type CloudDocument = z.infer<typeof cloudDocumentSchema>;
export function encodeGym(store: GymStore): CloudDocument {
  const s = gymStoreSchema.parse(store);
  const tables: CloudDocument['tables'] = {
    exercises: [],
    routines: [],
    routine_exercises: [],
    workouts: [],
    workout_exercises: [],
    sets: [],
    preferences: [],
    mappings: [],
    batches: [],
  };
  const add = (
    table: CloudTable,
    id: string,
    data: Record<string, unknown>,
    position: number,
    parent: string | null = null,
  ) => tables[table].push({ id, data, position, parent });
  s.exercises.forEach((e, i) => add('exercises', e.id, e, i));
  s.routines.forEach(({ exercises, ...r }, i) => {
    add('routines', r.id, r, i);
    exercises.forEach((e, n) =>
      add('routine_exercises', JSON.stringify([r.id, e.id]), e, n, r.id),
    );
  });
  const workouts = [
    ...s.history.map((w) => ({ w, bucket: 'history' })),
    ...s.legacyArchive.map((w) => ({ w, bucket: 'legacyArchive' })),
    ...(s.active ? [{ w: s.active, bucket: 'active' }] : []),
  ];
  workouts.forEach(({ w: { exercises, ...w }, bucket }, i) => {
    add('workouts', w.id, { ...w, bucket }, i);
    exercises.forEach(({ sets, ...e }, n) => {
      // Composite row IDs preserve embedded domain IDs while avoiding collisions between sessions.
      const key = JSON.stringify([w.id, e.id]);
      add('workout_exercises', key, e, n, w.id);
      sets.forEach((set, j) =>
        add('sets', JSON.stringify([w.id, e.id, set.id]), set, j, key),
      );
    });
  });
  Object.entries(s.exercisePreferences).forEach(([id, p], i) =>
    add('preferences', id, p, i),
  );
  Object.entries(s.hevyMappings).forEach(([id, exerciseId], i) =>
    add('mappings', id, { exerciseId }, i),
  );
  s.importBatches.forEach((b, i) => add('batches', b.id, b, i));
  for (const t of cloudTables)
    if (new Set(tables[t].map((r) => r.id)).size !== tables[t].length)
      throw new Error(`Duplicate ${t} IDs`);
  return cloudDocumentSchema.parse({ formatVersion: 1, tables });
}
export function decodeGym(document: unknown): GymStore {
  const { tables } = cloudDocumentSchema.parse(document);
  const rows = (t: CloudTable, parent?: string) =>
    tables[t]
      .filter((r) => parent === undefined || r.parent === parent)
      .sort((a, b) => a.position - b.position);
  const workouts: Record<string, unknown>[] = rows('workouts').map((r) => ({
    ...r.data,
    exercises: rows('workout_exercises', r.id).map((e) => ({
      ...e.data,
      sets: rows('sets', e.id).map((s) => s.data),
    })),
  }));
  return gymStoreSchema.parse({
    version: 2,
    schemaRevision: 3,
    exercises: rows('exercises').map((r) => r.data),
    routines: rows('routines').map((r) => ({
      ...r.data,
      exercises: rows('routine_exercises', r.id).map((e) => e.data),
    })),
    history: workouts.filter((w) => w.bucket === 'history'),
    legacyArchive: workouts.filter((w) => w.bucket === 'legacyArchive'),
    active: workouts.find((w) => w.bucket === 'active') ?? null,
    exercisePreferences: Object.fromEntries(
      rows('preferences').map((r) => [r.id, r.data]),
    ),
    hevyMappings: Object.fromEntries(
      rows('mappings').map((r) => [r.id, r.data.exerciseId]),
    ),
    importBatches: rows('batches').map((r) => r.data),
  });
}
export function gymMigrationCounts(store: GymStore) {
  const doc = encodeGym(store);
  return {
    ...Object.fromEntries(cloudTables.map((t) => [t, doc.tables[t].length])),
    completedWorkouts: store.history.length,
    legacyReviewWorkouts: store.legacyArchive.length,
    activeWorkouts: Number(Boolean(store.active)),
    fingerprints: store.history.filter((w) => w.provenance.fingerprint).length,
  };
}
