import { z } from 'zod';
import { gymStoreSchema, initialGymStore, type GymStore } from './gym-storage';
import { realHistory } from '../analytics/gym';
export const gymBackupSchema = z.object({
  format: z.literal('stillform-gym'),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  storageVersion: z.literal(2),
  data: gymStoreSchema,
});
export function exportGymJson(store: GymStore) {
  return JSON.stringify(
    gymBackupSchema.parse({
      format: 'stillform-gym',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      storageVersion: 2,
      data: store,
    }),
    null,
    2,
  );
}
export function canBootstrapGym(store: GymStore) {
  return (
    JSON.stringify(gymStoreSchema.parse(store)) ===
    JSON.stringify(gymStoreSchema.parse(initialGymStore()))
  );
}
export function previewGymBootstrap(raw: string, current: GymStore) {
  if (!canBootstrapGym(current))
    throw new Error(
      'Restore is limited to an empty, unmodified Gym browser. Existing data will not be overwritten or merged.',
    );
  if (raw.length > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB');
  const backup = gymBackupSchema.parse(JSON.parse(raw));
  return {
    data: backup.data,
    base: JSON.stringify(current),
    exportedAt: backup.exportedAt,
  };
}
export function commitGymBootstrap(
  plan: ReturnType<typeof previewGymBootstrap>,
  current: GymStore,
  approved: boolean,
  save: (store: GymStore) => boolean,
) {
  if (!approved) throw new Error('Review and confirm the backup first');
  if (!canBootstrapGym(current) || JSON.stringify(current) !== plan.base)
    throw new Error('Gym changed since preview. Nothing restored.');
  if (!save(gymStoreSchema.parse(plan.data)))
    throw new Error('Backup could not be saved. Nothing restored.');
}
function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportGymCsv(store: GymStore) {
  const rows: unknown[][] = [
    [
      'workout_id',
      'routine_id',
      'routine_name',
      'started_at',
      'finished_at',
      'duration_minutes',
      'exercise_id',
      'exercise_name',
      'primary_muscle_group',
      'exercise_order',
      'set_order',
      'weight_kg',
      'reps',
      'rir',
      'rpe',
      'failure',
      'completed',
      'logged_at',
      'workout_notes',
      'exercise_notes',
      'source',
      'source_exercise_name',
      'set_type',
      'source_set_index',
      'distance_km',
      'duration_seconds',
      'superset_id',
      'source_fingerprint',
      'import_batch_id',
      'source_row_order',
      'source_exercise_notes',
    ],
  ];
  for (const w of realHistory(store.history))
    w.exercises.forEach((e, ei) =>
      e.sets.forEach((s, si) =>
        rows.push([
          w.id,
          w.routineId,
          w.routineName,
          w.startedAt,
          w.endedAt,
          w.durationMinutes,
          e.exerciseId,
          e.name,
          e.primaryMuscleGroup,
          ei + 1,
          si + 1,
          s.weight,
          s.reps,
          s.rir,
          s.rpe,
          s.failure,
          s.completed,
          s.loggedAt,
          w.notes,
          e.notes,
          w.provenance.source,
          e.sourceName,
          s.setType,
          s.sourceSetIndex,
          s.distanceKm,
          s.durationSeconds,
          s.supersetId,
          w.provenance.fingerprint,
          w.provenance.batchId,
          s.sourceRowOrder,
          s.sourceExerciseNotes,
        ]),
      ),
    );
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
