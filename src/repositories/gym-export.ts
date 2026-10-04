import { z } from 'zod';
import { gymStoreSchema, type GymStore } from './gym-storage';
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
        ]),
      ),
    );
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
