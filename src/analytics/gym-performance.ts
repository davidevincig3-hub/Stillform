import type { GymWorkout, GymWorkoutExercise } from '../domain/gym';
import { realHistory, effortKnown } from './gym';
import { comparableFirstSet } from './gym-comparison';
import { median } from './recovery-baseline';
import { polarCalendarDate } from '../domain/polar-training-range';

export const gymPerformancePolicy = {
  version: 'gym-performance-v1',
  minimumDates: 3,
  recentLimit: 8,
  timeZone: 'Europe/Rome',
  label:
    'Three distinct session dates is a product evidence rule, not a validated physiological threshold.',
} as const;
type Set = GymWorkoutExercise['sets'][number];
export interface RecordedSet {
  workoutId: string;
  date: string;
  block: number;
  equipment: string | null;
  setType: string;
  source: GymWorkout['provenance']['source'];
  set: Set;
}
export interface GymComparisonPoint {
  workoutId: string;
  date: string;
  block: number;
  source: GymWorkout['provenance']['source'];
  load: number;
}
interface Candidate extends GymComparisonPoint {
  protocol: string;
  equipment: string;
  reps: number;
  setType: string;
  rir: number | null;
  rpe: number | null;
  failure: boolean;
  superset: boolean;
}
export interface GymPerformance {
  version: string;
  asOf: string;
  exerciseId: string;
  timeZone: string;
  totals: {
    exposures: number;
    sets: number;
    effortSets: number;
    loadRepSets: number;
    descriptiveSets: number;
  };
  trend: {
    workoutId: string;
    date: string;
    sets: number;
    blocks: number;
    minLoad: number | null;
    maxLoad: number | null;
    minReps: number | null;
    maxReps: number | null;
  }[];
  records: {
    equipment: string | null;
    setType: string;
    reps: number;
    load: number;
    reference: GymComparisonPoint;
  }[];
  bestLoads: {
    equipment: string | null;
    setType: string;
    load: number;
    reference: GymComparisonPoint;
  }[];
  bestReps: {
    equipment: string | null;
    setType: string;
    load: number;
    reps: number;
    reference: GymComparisonPoint;
  }[];
  recordGroups: number;
  comparison: null | {
    protocol: {
      equipment: string;
      block: number;
      reps: number;
      setType: string;
      rir: number | null;
      rpe: number | null;
      failure: boolean;
      superset: boolean;
    };
    eligibleDates: number;
    from: string;
    to: string;
    recent: GymComparisonPoint[];
    reference: GymComparisonPoint[];
    referenceMedian: number;
    current: GymComparisonPoint;
    deltaKg: number;
  };
  eligibleBlocks: number;
  confidence: 'low' | 'insufficient';
  exclusions: { reason: string; blocks: number }[];
  excludedRecent: {
    workoutId: string;
    date: string;
    block: number;
    reasons: string[];
  }[];
  limitations: string[];
}
const range = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? [Math.min(...known), Math.max(...known)] : [null, null];
};
// Entire relevant history goes in; only compact summaries and references come out.
export function gymPerformance(
  workouts: GymWorkout[],
  exerciseId: string,
  asOf = new Date().toISOString(),
): GymPerformance {
  const rows: RecordedSet[] = [],
    candidates: Candidate[] = [];
  const exclusions = new Map<string, number>();
  const excludedRecent: GymPerformance['excludedRecent'] = [];
  const trend: GymPerformance['trend'] = [];
  for (const workout of realHistory(workouts)
    .filter((w) => Date.parse(w.startedAt) <= Date.parse(asOf))
    .sort(
      (a, b) =>
        b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id),
    )) {
    const blocks = workout.exercises.filter((e) => e.exerciseId === exerciseId);
    const completed = blocks.flatMap((e) => e.sets.filter((s) => s.completed));
    if (!completed.length) continue;
    const loads = range(completed.map((s) => s.weight)),
      reps = range(completed.map((s) => s.reps));
    trend.push({
      workoutId: workout.id,
      date: workout.startedAt,
      sets: completed.length,
      blocks: blocks.length,
      minLoad: loads[0],
      maxLoad: loads[1],
      minReps: reps[0],
      maxReps: reps[1],
    });
    blocks.forEach((exercise, index) => {
      if (!exercise.sets.some((s) => s.completed)) return;
      const block = index + 1;
      for (const set of exercise.sets.filter((s) => s.completed))
        rows.push({
          workoutId: workout.id,
          date: workout.startedAt,
          block,
          equipment: exercise.equipment ?? null,
          setType: set.setType ?? 'normal',
          source: workout.provenance.source,
          set,
        });
      const first = exercise.sets[0];
      const reasons: string[] = [];
      if (!first?.completed) reasons.push('First set not completed');
      if (first?.weight == null || first.weight <= 0)
        reasons.push('Positive recorded load unavailable');
      if (first?.reps == null || first.reps <= 0)
        reasons.push('Positive recorded repetitions unavailable');
      if (first && !effortKnown(first))
        reasons.push('First-set effort unknown');
      if (first?.setType && !['normal', 'failure'].includes(first.setType))
        reasons.push(`First set is ${first.setType}`);
      if (!exercise.equipment?.trim())
        reasons.push('Historical equipment unspecified');
      const match = comparableFirstSet(exercise);
      if (reasons.length || !match) {
        reasons.forEach((r) => exclusions.set(r, (exclusions.get(r) ?? 0) + 1));
        excludedRecent.push({
          workoutId: workout.id,
          date: workout.startedAt,
          block,
          reasons,
        });
        return;
      }
      const set = match.set;
      candidates.push({
        workoutId: workout.id,
        date: workout.startedAt,
        block,
        source: workout.provenance.source,
        load: set.weight!,
        equipment: exercise.equipment!,
        reps: set.reps!,
        setType: set.setType ?? 'normal',
        rir: set.rir,
        rpe: set.rpe,
        failure: set.failure,
        superset: !!set.supersetId,
        protocol: JSON.stringify([
          match.key,
          block,
          set.setType ?? 'normal',
          !!set.supersetId,
        ]),
      });
    });
  }
  const protocols = new Map<string, Candidate[]>();
  for (const c of candidates)
    protocols.set(c.protocol, [...(protocols.get(c.protocol) ?? []), c]);
  // One deterministic observation per local date; never inflate evidence with repeated sessions.
  const distinct = [...protocols.values()].map((group) => {
    const dates = new Set<string>();
    return group.filter((c) => {
      const day = polarCalendarDate(
        new Date(c.date),
        gymPerformancePolicy.timeZone,
      );
      if (dates.has(day)) return false;
      dates.add(day);
      return true;
    });
  });
  const chosen = distinct
    .filter((g) => g.length >= gymPerformancePolicy.minimumDates)
    .sort(
      (a, b) =>
        b[0].date.localeCompare(a[0].date) ||
        b.length - a.length ||
        a[0].protocol.localeCompare(b[0].protocol),
    )[0];
  const point = (r: Candidate | RecordedSet): GymComparisonPoint => ({
    workoutId: r.workoutId,
    date: r.date,
    block: r.block,
    source: r.source,
    load: 'load' in r ? r.load : r.set.weight!,
  });
  let comparison: GymPerformance['comparison'] = null;
  if (chosen) {
    const c = chosen[0],
      reference = chosen.slice(1, 4).map(point);
    const referenceMedian = median(reference.map((p) => p.load))!;
    comparison = {
      protocol: {
        equipment: c.equipment,
        block: c.block,
        reps: c.reps,
        setType: c.setType,
        rir: c.rir,
        rpe: c.rpe,
        failure: c.failure,
        superset: c.superset,
      },
      eligibleDates: chosen.length,
      from: chosen.at(-1)!.date,
      to: c.date,
      recent: chosen.slice(0, 8).map(point),
      reference,
      referenceMedian,
      current: point(c),
      deltaKg: c.load - referenceMedian,
    };
    const others = candidates.filter((c) => c.protocol !== chosen[0].protocol);
    if (others.length)
      exclusions.set('Different recorded comparison protocol', others.length);
    others.forEach((c) =>
      excludedRecent.push({
        workoutId: c.workoutId,
        date: c.date,
        block: c.block,
        reasons: ['Different recorded comparison protocol'],
      }),
    );
    const sameDay = candidates.filter(
      (c) => c.protocol === chosen[0].protocol && !chosen.includes(c),
    );
    if (sameDay.length)
      exclusions.set(
        'Additional session on the same calendar date',
        sameDay.length,
      );
    sameDay.forEach((c) =>
      excludedRecent.push({
        workoutId: c.workoutId,
        date: c.date,
        block: c.block,
        reasons: ['Additional session on the same calendar date'],
      }),
    );
  } else if (candidates.length) {
    exclusions.set(
      'Fewer than three distinct dates in a matching protocol',
      candidates.length,
    );
    candidates.forEach((c) =>
      excludedRecent.push({
        workoutId: c.workoutId,
        date: c.date,
        block: c.block,
        reasons: ['Fewer than three distinct dates in a matching protocol'],
      }),
    );
  }
  const recordMap = new Map<string, RecordedSet>();
  const loadMap = new Map<string, RecordedSet>();
  const repMap = new Map<string, RecordedSet>();
  for (const r of rows) {
    if (r.set.weight === null) continue;
    const loadKey = JSON.stringify([r.equipment, r.setType]);
    if (
      !loadMap.has(loadKey) ||
      loadMap.get(loadKey)!.set.weight! < r.set.weight
    )
      loadMap.set(loadKey, r);
    if (r.set.reps === null || r.set.reps <= 0) continue;
    const key = JSON.stringify([r.equipment, r.setType, r.set.reps]);
    if (!recordMap.has(key) || recordMap.get(key)!.set.weight! < r.set.weight)
      recordMap.set(key, r);
    const repKey = JSON.stringify([r.equipment, r.setType, r.set.weight]);
    if (!repMap.has(repKey) || repMap.get(repKey)!.set.reps! < r.set.reps)
      repMap.set(repKey, r);
  }
  return {
    version: gymPerformancePolicy.version,
    asOf,
    exerciseId,
    timeZone: gymPerformancePolicy.timeZone,
    totals: {
      exposures: trend.length,
      sets: rows.length,
      effortSets: rows.filter((r) => effortKnown(r.set)).length,
      loadRepSets: rows.filter(
        (r) => r.set.weight !== null && r.set.reps !== null && r.set.reps > 0,
      ).length,
      descriptiveSets: rows.filter(
        (r) =>
          r.set.weight !== null ||
          r.set.reps !== null ||
          r.set.durationSeconds != null ||
          r.set.distanceKm != null,
      ).length,
    },
    trend: trend.slice(0, gymPerformancePolicy.recentLimit),
    records: [...recordMap.values()].slice(0, 12).map((r) => ({
      equipment: r.equipment,
      setType: r.setType,
      reps: r.set.reps!,
      load: r.set.weight!,
      reference: point(r),
    })),
    bestLoads: [...loadMap.values()].slice(0, 12).map((r) => ({
      equipment: r.equipment,
      setType: r.setType,
      load: r.set.weight!,
      reference: point(r),
    })),
    bestReps: [...repMap.values()].slice(0, 12).map((r) => ({
      equipment: r.equipment,
      setType: r.setType,
      load: r.set.weight!,
      reps: r.set.reps!,
      reference: point(r),
    })),
    recordGroups: recordMap.size,
    comparison,
    eligibleBlocks: candidates.length,
    confidence: comparison ? 'low' : 'insufficient',
    exclusions: [...exclusions]
      .map(([reason, blocks]) => ({ reason, blocks }))
      .sort((a, b) => a.reason.localeCompare(b.reason)),
    excludedRecent: excludedRecent
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.workoutId.localeCompare(b.workoutId) ||
          a.block - b.block,
      )
      .slice(0, 8),
    limitations: [
      gymPerformancePolicy.label,
      'Recorded load changes at fixed reps and recorded effort do not establish physiological improvement. Technique, range of motion, rest and machine settings are unrecorded; confidence is capped at low.',
      'Repeated blocks are compared by occurrence within the exercise, not merged. First sets are never replaced by later best sets. Superset presence is matched; partner exercises/rest are unknown.',
      'Unknown RIR is retained. RPE and explicit failure are independent; no RIR conversion is used.',
      'Descriptive records include all completed set types, separated by historical equipment. Missing equipment cannot establish equivalence. No e1RM, advice or stall/fatigue classification.',
      'Trends show up to eight recent exposures; each record list shows up to twelve groups, prioritizing recently encountered groups. Calculations consider all confirmed history up to the assessment time.',
    ],
  };
}

export function gymPerformanceCoverage(
  workouts: GymWorkout[],
  asOf = new Date().toISOString(),
) {
  const ids = [
    ...new Set(
      realHistory(workouts)
        .filter((w) => Date.parse(w.startedAt) <= Date.parse(asOf))
        .flatMap((w) =>
          w.exercises
            .filter((e) => e.sets.some((s) => s.completed))
            .map((e) => e.exerciseId),
        ),
    ),
  ];
  const results = ids.map((id) => gymPerformance(workouts, id, asOf));
  return {
    usedExercises: ids.length,
    descriptive: results.filter((r) => r.totals.descriptiveSets > 0).length,
    loadRepHistory: results.filter((r) => r.totals.loadRepSets > 0).length,
    strongerComparison: results.filter((r) => r.comparison !== null).length,
    anyEffort: results.filter((r) => r.totals.effortSets > 0).length,
    usefulEffortCoverage: results.filter(
      (r) => r.totals.effortSets / r.totals.sets >= 0.5,
    ).length,
    definition:
      'Used: at least one completed confirmed set. Descriptive: recorded load, reps, duration or distance. Load/rep history: at least one recorded pair. Useful effort coverage: at least 50% of completed sets record RIR, RPE or explicit failure; descriptive product cutoff, not physiology.',
  };
}
