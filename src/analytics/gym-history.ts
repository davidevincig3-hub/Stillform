import { realHistory } from './gym';
import type { Exercise, GymWorkout } from '../domain/gym';
export function findExerciseHistory(
  exercises: Exercise[],
  workouts: GymWorkout[],
  query = '',
  sort: 'recent' | 'name' | 'frequency' = 'recent',
) {
  const usage = new Map<string, { date: string; sets: number }>();
  for (const w of realHistory(workouts))
    for (const e of w.exercises) {
      const count = e.sets.filter((s) => s.completed).length;
      if (!count) continue;
      const old = usage.get(e.exerciseId);
      usage.set(e.exerciseId, {
        date: old?.date ?? w.startedAt,
        sets: (old?.sets ?? 0) + count,
      });
    }
  return exercises
    .filter(
      (e) =>
        usage.has(e.id) &&
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .map((e) => ({
      ...e,
      lastDate: usage.get(e.id)!.date,
      setCount: usage.get(e.id)!.sets,
    }))
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'frequency'
          ? b.setCount - a.setCount
          : b.lastDate.localeCompare(a.lastDate) ||
            a.name.localeCompare(b.name),
    );
}
export function findWorkoutHistory(
  workouts: GymWorkout[],
  query = '',
  title = '',
  from = '',
  to = '',
) {
  return realHistory(workouts).filter((w) => {
    const date = new Date(w.startedAt),
      day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return (
      w.routineName.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!title || w.routineName === title) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
}
