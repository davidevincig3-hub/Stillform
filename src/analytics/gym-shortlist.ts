import type { GymStore } from '../repositories/gym-storage';
import { realHistory } from './gym';
import { polarCalendarDate } from '../domain/polar-training-range';

export const shortlistStart = '2026-09-01';
export function recentExercises(
  store: GymStore,
  asOf = new Date().toISOString(),
  timeZone = 'Europe/Rome',
) {
  const today = polarCalendarDate(new Date(asOf), timeZone);
  const usage = new Map<
    string,
    { exposures: number; sets: number; latest: string; score: number }
  >();
  for (const workout of realHistory(store.history)) {
    const date = polarCalendarDate(new Date(workout.startedAt), timeZone);
    if (
      date < shortlistStart ||
      Date.parse(workout.startedAt) > Date.parse(asOf)
    )
      continue;
    const perWorkout = new Map<string, number>();
    for (const exercise of workout.exercises) {
      const sets = exercise.sets.filter(
        (s) =>
          s.completed ||
          s.weight !== null ||
          s.reps !== null ||
          s.rir !== null ||
          s.rpe !== null ||
          s.failure,
      ).length;
      if (sets)
        perWorkout.set(
          exercise.exerciseId,
          (perWorkout.get(exercise.exerciseId) ?? 0) + sets,
        );
    }
    const age = (Date.parse(today) - Date.parse(date)) / 86400000;
    for (const [id, sets] of perWorkout) {
      const old = usage.get(id) ?? {
        exposures: 0,
        sets: 0,
        latest: workout.startedAt,
        score: 0,
      };
      usage.set(id, {
        exposures: old.exposures + 1,
        sets: old.sets + sets,
        latest: old.latest > workout.startedAt ? old.latest : workout.startedAt,
        score: old.score + 2 ** (-age / 28),
      });
    }
  }
  const detected = store.exercises.filter((e) => usage.has(e.id)).length;
  const rows = store.exercises
    .filter((e) => usage.has(e.id) || store.exercisePreferences[e.id]?.pinned)
    .map((exercise) => ({
      exercise,
      ...(usage.get(exercise.id) ?? {
        exposures: 0,
        sets: 0,
        latest: null,
        score: 0,
      }),
      pinned: store.exercisePreferences[exercise.id]?.pinned ?? false,
      dismissed: store.exercisePreferences[exercise.id]?.dismissed ?? false,
    }))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.score - a.score ||
        (b.latest ?? '').localeCompare(a.latest ?? '') ||
        a.exercise.id.localeCompare(b.exercise.id),
    );
  return {
    detected,
    rows: rows.filter((r) => !r.dismissed),
    dismissed: rows.filter((r) => r.dismissed),
  };
}
