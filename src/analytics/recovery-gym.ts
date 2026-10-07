import type { GymWorkout } from '../domain/gym';
import type {
  RecoveryEngineInput,
  RecoveryMetric,
} from '../domain/recovery-engine';
import { realHistory } from './gym';
import { comparableFirstSet } from './gym-comparison';
import { addDays } from '../domain/polar';
import {
  polarCalendarDate,
  DEFAULT_POLAR_TIME_ZONE,
} from '../domain/polar-training-range';

// Local Gym remains in the browser. No set data is uploaded for recovery assessment.
export function withLocalGymEvidence(
  input: RecoveryEngineInput,
  workouts: GymWorkout[],
  asOf: string,
): RecoveryEngineInput {
  const real = realHistory(workouts).filter(
    (w) => Date.parse(w.startedAt) <= Date.parse(asOf),
  );
  const localIds = new Set(real.map((w) => w.id));
  const training = [
    ...input.training.filter(
      (t) => !t.localWorkoutId || !localIds.has(t.localWorkoutId),
    ),
    ...real.map((w) => ({
      id: w.id,
      localWorkoutId: w.id,
      date: polarCalendarDate(
        new Date(w.startedAt),
        input.calendarTimeZone ?? DEFAULT_POLAR_TIME_ZONE,
      ),
      sport: 'strength',
      durationMinutes: w.durationMinutes,
      completedSets: w.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => s.completed).length,
        0,
      ),
      source: 'confirmed_gym' as const,
    })),
  ];
  const protocols = new Map<string, RecoveryMetric>();
  for (const w of real)
    for (const e of w.exercises) {
      // Never select a later best set, estimate 1RM, or compare missing effort.
      const match = comparableFirstSet(e);
      if (!match) continue;
      const { set, key } = match;
      const metric = protocols.get(key) ?? {
        id: `gym_load:${key}`,
        name: `${e.name} · fixed reps/effort load`,
        family: 'performance' as const,
        unit: 'kg',
        context:
          'First set, same exercise/equipment/reps and recorded RIR/RPE/failure. Rest/technique comparability remains limited.',
        orientation: 'lower_suppressed' as const,
        observations: [],
      };
      metric.observations.push({
        date: polarCalendarDate(
          new Date(w.startedAt),
          input.calendarTimeZone ?? DEFAULT_POLAR_TIME_ZONE,
        ),
        value: set.weight!,
        complete: true,
        quality: 'limited',
        source: 'confirmed_gym',
      });
      protocols.set(key, metric);
    }
  return {
    ...input,
    training,
    metrics: [
      ...input.metrics,
      ...[...protocols.values()].filter((metric) =>
        metric.observations.some(
          (row) => row.date >= addDays(input.asOfDate, -30),
        ),
      ),
    ],
    limitations: input.limitations
      .filter(
        (s) => !s.startsWith('No validated comparable performance series'),
      )
      .concat(
        'Running performance comparison is unavailable; no drift calculation. Gym comparison requires identical first-set exercise, reps and recorded effort; missing effort is never estimated.',
      ),
  };
}
