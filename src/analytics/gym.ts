import type { GymWorkout } from '../domain/gym';
import type { WorkoutSet } from '../domain/models';
import type { gymSetSchema } from '../domain/gym';
import type { z } from 'zod';
export function realHistory(workouts: GymWorkout[]) {
  return workouts
    .filter((w) => w.status === 'completed' && w.dataOrigin === 'user')
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
export function exerciseExposures(
  workouts: GymWorkout[],
  exerciseId: string,
  limit = 4,
) {
  return realHistory(workouts)
    .flatMap((workout) => {
      const exercises = workout.exercises.filter(
        (e) => e.exerciseId === exerciseId,
      );
      const sets = exercises.flatMap((e) => e.sets.filter((s) => s.completed));
      return sets.length
        ? [
            {
              workoutId: workout.id,
              date: workout.startedAt,
              routineName: workout.routineName,
              sets,
            },
          ]
        : [];
    })
    .slice(0, limit);
}
export function formatSet(set: z.infer<typeof gymSetSchema>) {
  return `${set.weight === null ? (set.sourceSetIndex !== undefined ? 'Load unrecorded' : 'Bodyweight') : `${set.weight} kg`}${set.reps !== null ? ` × ${set.reps}` : ''}${set.distanceKm != null ? ` · ${set.distanceKm} km` : ''}${set.durationSeconds != null ? ` · ${set.durationSeconds} s` : ''}${set.rir !== null ? ` @ ${set.rir} RIR` : ''}${set.rpe !== null ? ` · ${set.rpe} RPE` : ''}${set.failure ? ' · failure' : ''}${set.setType && set.setType !== 'normal' && set.setType !== 'failure' ? ` · ${set.setType}` : ''}${set.supersetId ? ` · superset ${set.supersetId}` : ''}`;
}
export function effortKnown(set: WorkoutSet) {
  return set.rir !== null || set.rpe !== null || set.failure;
}
export function weeklyGymSummary(workouts: GymWorkout[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const muscles = new Map<string, { sets: number; workouts: Set<string> }>();
  const unassigned = { sets: 0, workouts: new Set<string>() };
  const effort = {
    rir: [] as number[],
    rpe: [] as number[],
    failure: 0,
    unknown: 0,
    total: 0,
  };
  for (const w of realHistory(workouts).filter(
    (w) =>
      Date.parse(w.startedAt) >= start.getTime() &&
      Date.parse(w.startedAt) <= now.getTime() &&
      Date.parse(w.startedAt) < end.getTime(),
  ))
    for (const e of w.exercises) {
      const sets = e.sets.filter((s) => s.completed);
      if (!sets.length) continue;
      const group =
        e.primaryMuscleGroup === null
          ? unassigned
          : (muscles.get(e.primaryMuscleGroup) ?? {
              sets: 0,
              workouts: new Set<string>(),
            });
      group.sets += sets.length;
      group.workouts.add(w.id);
      if (e.primaryMuscleGroup !== null)
        muscles.set(e.primaryMuscleGroup, group);
      for (const s of sets) {
        effort.total++;
        if (s.rir !== null) effort.rir.push(s.rir);
        if (s.rpe !== null) effort.rpe.push(s.rpe);
        if (s.failure) effort.failure++;
        if (!effortKnown(s)) effort.unknown++;
      }
    }
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    muscles: [...muscles].map(([name, data]) => ({
      name,
      sets: data.sets,
      frequency: data.workouts.size,
    })),
    effort,
    unassigned: { sets: unassigned.sets, frequency: unassigned.workouts.size },
  };
}
