import type { GymWorkout, GymWorkoutExercise } from '../domain/gym';
import { realHistory, effortKnown } from './gym';
import { polarCalendarDate } from '../domain/polar-training-range';

export const trendPolicy = {
  version: 'gym-performance-trend-v1',
  timeZone: 'Europe/Rome',
  weeks: 12,
  windowDays: 28,
  minimumDates: 2,
  explanation:
    'Combines recorded weight and repetitions. Changes can also reflect differences in effort.',
} as const;
export const trendTables = {
  general: [
    [3.28, 0.95],
    [4.94, 0.9],
    [7.15, 0.85],
    [9.75, 0.8],
    [12.37, 0.75],
    [14.8, 0.7],
    [17.11, 0.65],
  ],
  bench: [
    [2.59, 0.95],
    [4.11, 0.9],
    [6.23, 0.85],
    [8.82, 0.8],
    [11.51, 0.75],
    [14.08, 0.7],
    [16.59, 0.65],
  ],
  leg: [
    [7.04, 0.95],
    [8.69, 0.9],
    [10.69, 0.85],
    [13.05, 0.8],
    [15.79, 0.75],
  ],
} as const;
export type TrendModel = keyof typeof trendTables;
// Audited canonical identities only. Custom/imported names are not classifications.
// No current built-in bench press identity exists; add verified IDs here deliberately.
export const verifiedTrendModels: Readonly<
  Record<string, Exclude<TrendModel, 'general'>>
> = {
  'builtin-leg-press': 'leg',
};
export function trendModel(
  id: string,
  verified = verifiedTrendModels,
): TrendModel {
  return Object.hasOwn(verified, id) ? verified[id] : 'general';
}
export function trendFraction(reps: number, model: TrendModel): number | null {
  if (!Number.isInteger(reps) || reps < 5 || reps > 15) return null;
  const points = trendTables[model];
  if (reps < points[0][0] || reps > points.at(-1)![0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [a, fa] = points[i - 1],
      [b, fb] = points[i];
    if (reps <= b) return fa + ((fb - fa) * (reps - a)) / (b - a);
  }
  return null;
}
export function trendSeriesValue(
  load: number | null,
  reps: number | null,
  model: TrendModel,
): number | null {
  if (load === null || !Number.isFinite(load) || load <= 0 || reps === null)
    return null;
  const fraction = trendFraction(reps, model);
  const value = fraction === null ? null : load / fraction;
  return value !== null && Number.isFinite(value) ? value : null;
}
// Arithmetic on calendar dates, not UTC parsing of user timestamps.
export function trendDateOffset(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
type Set = GymWorkoutExercise['sets'][number];
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2;
}
function normalizedIndex(value: number | null, baseline: number | null) {
  if (value === null || baseline === null) return null;
  const index = (value / baseline) * 100;
  return Number.isFinite(index) && index > 0 ? index : null;
}
interface Observation {
  day: string;
  value: number;
  effort: string | null;
}
export interface TrendWindow {
  date: string;
  from: string;
  median: number | null;
  dates: number;
  exposures: number;
  effortExposures: number;
  effortContexts: string[];
  index: number | null;
}
export interface TrendProtocol {
  key: string;
  exerciseId: string;
  name: string;
  muscle: string | null;
  equipment: string | null;
  block: number;
  setType: string;
  superset: string | null;
  model: TrendModel;
  eligible: boolean;
  baseline: TrendWindow;
  points: TrendWindow[];
}
export interface GymTrend {
  version: string;
  asOf: string;
  timeZone: string;
  protocols: TrendProtocol[];
  exercises: {
    id: string;
    name: string;
    muscles: (string | null)[];
    blocks: number;
    eligibleBlocks: number;
  }[];
  exclusions: { reason: string; blocks: number }[];
  counts: {
    blocks: number;
    eligibleBlocks: number;
    unassignedBlocks: number;
    effortBlocks: number;
  };
}
function effortContext(set: Set) {
  return effortKnown(set)
    ? JSON.stringify({ rir: set.rir, rpe: set.rpe, failure: set.failure })
    : null;
}
function supersetContext(
  workout: GymWorkout,
  exercise: GymWorkoutExercise,
  set: Set,
) {
  if (!set.supersetId) return null;
  const occurrences = new Map<string, number>();
  const members = workout.exercises.flatMap((e) => {
    const block = (occurrences.get(e.exerciseId) ?? 0) + 1;
    occurrences.set(e.exerciseId, block);
    return e.sets.some((s) => s.supersetId === set.supersetId)
      ? [[e.exerciseId, block]]
      : [];
  });
  // An unidentified partner is not equivalent to a known superset. Retain its tag.
  return JSON.stringify(
    members.length > 1
      ? members.sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        )
      : ['unknown-partner', exercise.exerciseId, set.supersetId],
  );
}
function windowSummary(rows: Observation[], date: string): TrendWindow {
  const from = trendDateOffset(date, -27);
  const selected = rows.filter((r) => r.day >= from && r.day <= date);
  const days = new Map<string, number[]>();
  for (const r of selected)
    days.set(r.day, [...(days.get(r.day) ?? []), r.value]);
  return {
    date,
    from,
    dates: days.size,
    exposures: selected.length,
    effortExposures: selected.filter((r) => r.effort !== null).length,
    effortContexts: [
      ...new Set(
        selected.map((r) => r.effort).filter((v): v is string => v !== null),
      ),
    ].sort(),
    median:
      days.size >= 2 ? median([...days.values()].map((v) => median(v)!)) : null,
    index: null,
  };
}
export function gymTrend(
  workouts: GymWorkout[],
  asOf = polarCalendarDate(new Date(), trendPolicy.timeZone),
  verified = verifiedTrendModels,
): GymTrend {
  const dates = Array.from({ length: 12 }, (_, i) =>
    trendDateOffset(asOf, (i - 11) * 7),
  );
  const from = trendDateOffset(dates[0], -27);
  const protocols = new Map<
    string,
    {
      protocol: Omit<TrendProtocol, 'eligible' | 'baseline' | 'points'>;
      rows: Observation[];
    }
  >();
  const exercises = new Map<string, GymTrend['exercises'][number]>();
  const exclusions = new Map<string, number>();
  const counts = {
    blocks: 0,
    eligibleBlocks: 0,
    unassignedBlocks: 0,
    effortBlocks: 0,
  };
  for (const w of realHistory(workouts)) {
    const day = polarCalendarDate(new Date(w.startedAt), trendPolicy.timeZone);
    if (day < from || day > asOf) continue;
    const occurrences = new Map<string, number>();
    for (const e of w.exercises) {
      const block = (occurrences.get(e.exerciseId) ?? 0) + 1;
      occurrences.set(e.exerciseId, block);
      if (!e.sets.some((s) => s.completed)) continue;
      counts.blocks++;
      if (e.primaryMuscleGroup === null) counts.unassignedBlocks++;
      const entry = exercises.get(e.exerciseId) ?? {
        id: e.exerciseId,
        name: e.name,
        muscles: [],
        blocks: 0,
        eligibleBlocks: 0,
      };
      entry.blocks++;
      if (!entry.muscles.includes(e.primaryMuscleGroup))
        entry.muscles.push(e.primaryMuscleGroup);
      exercises.set(e.exerciseId, entry);
      // Skip warm-ups/dropsets, then take the first completed work set. Never hunt for a better one.
      const set = e.sets.find(
        (s) =>
          s.completed && !['warmup', 'dropset'].includes(s.setType ?? 'normal'),
      );
      const model = trendModel(e.exerciseId, verified);
      const value = set ? trendSeriesValue(set.weight, set.reps, model) : null;
      const reason = !set
        ? 'No completed work set'
        : !['normal', 'failure'].includes(set.setType ?? 'normal')
          ? 'Unsupported work-set type'
          : set.weight === null ||
              !Number.isFinite(set.weight) ||
              set.weight <= 0
            ? 'Positive finite load unavailable'
            : value === null
              ? `Repetitions outside ${model} V1 range`
              : null;
      if (reason) {
        exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1);
        continue;
      }
      counts.eligibleBlocks++;
      entry.eligibleBlocks++;
      if (effortKnown(set!)) counts.effortBlocks++;
      const equipment = e.equipment?.trim() || null;
      const setType = set!.setType ?? 'normal';
      const superset = supersetContext(w, e, set!);
      const key = JSON.stringify([
        e.exerciseId,
        equipment,
        block,
        setType,
        superset,
        e.primaryMuscleGroup,
        model,
      ]);
      const p = protocols.get(key) ?? {
        protocol: {
          key,
          exerciseId: e.exerciseId,
          name: e.name,
          muscle: e.primaryMuscleGroup,
          equipment,
          block,
          setType,
          superset,
          model,
        },
        rows: [],
      };
      p.rows.push({ day, value: value!, effort: effortContext(set!) });
      protocols.set(key, p);
    }
  }
  return {
    version: trendPolicy.version,
    asOf,
    timeZone: trendPolicy.timeZone,
    counts,
    exercises: [...exercises.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    ),
    exclusions: [...exclusions]
      .map(([reason, blocks]) => ({ reason, blocks }))
      .sort((a, b) => a.reason.localeCompare(b.reason)),
    protocols: [...protocols.values()]
      .map(({ protocol, rows }) => {
        const points = dates.map((date) => windowSummary(rows, date));
        const baseline = points[0];
        const eligible =
          normalizedIndex(baseline.median, baseline.median) !== null &&
          normalizedIndex(points.at(-1)!.median, baseline.median) !== null;
        return {
          ...protocol,
          eligible,
          baseline,
          points: points.map((p) => ({
            ...p,
            index: eligible ? normalizedIndex(p.median, baseline.median) : null,
          })),
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
export function gymTrendView(
  trend: GymTrend,
  muscle?: string | null,
  exerciseId?: string,
) {
  const relevant = trend.protocols.filter(
    (p) =>
      (muscle === undefined || p.muscle === muscle) &&
      (!exerciseId || p.exerciseId === exerciseId),
  );
  const cohort = relevant.filter(
    (p) =>
      p.eligible &&
      !(muscle === null && !exerciseId) &&
      (muscle !== undefined || exerciseId || p.muscle !== null),
  );
  const mean = (values: number[]) =>
    values.reduce(
      (average, value, i) => average + (value - average) / (i + 1),
      0,
    );
  const points = Array.from({ length: 12 }, (_, i) => {
    const date = trendDateOffset(trend.asOf, (i - 11) * 7);
    const available = cohort.filter((p) => p.points[i].index !== null);
    const groups = new Map<string, Map<string, number[]>>();
    for (const p of available) {
      const group =
        groups.get(p.muscle ?? 'Unassigned') ?? new Map<string, number[]>();
      group.set(p.exerciseId, [
        ...(group.get(p.exerciseId) ?? []),
        p.points[i].index!,
      ]);
      groups.set(p.muscle ?? 'Unassigned', group);
    }
    return {
      date,
      from: trendDateOffset(date, -27),
      index:
        cohort.length && available.length === cohort.length
          ? mean(
              [...groups.values()].map((group) =>
                mean([...group.values()].map(mean)),
              ),
            )
          : null,
      availableProtocols: available.length,
      requiredProtocols: cohort.length,
      dates: available.reduce((n, p) => n + p.points[i].dates, 0),
      effortExposures: available.reduce(
        (n, p) => n + p.points[i].effortExposures,
        0,
      ),
      exposures: available.reduce((n, p) => n + p.points[i].exposures, 0),
    };
  });
  return {
    points,
    cohort,
    relevant,
    groups: [...new Set(cohort.map((p) => p.muscle))],
    exercises: [...new Set(cohort.map((p) => p.exerciseId))],
  };
}
