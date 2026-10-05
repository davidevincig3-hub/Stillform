import type {
  RecoveryEngineInput,
  RecoveryEngineResult,
  RecoveryMetric,
  RecoveryFamily,
  RecoverySignal,
} from '../domain/recovery-engine';
import { addDays } from '../domain/polar';
import { baselineForDay, observationDays, median } from './recovery-baseline';

export const recoveryEnginePolicy = {
  label: 'Product heuristics; not clinically or physiologically validated',
  baselineDays: 28,
  recentDays: 3,
  minimumRecentObservations: 2,
  relativeDeviationFloor: 0.1,
  madMultiplier: 2.5,
};
function evaluateMetric(metric: RecoveryMetric, asOf: string): RecoverySignal {
  const baseline = baselineForDay(metric.observations, asOf),
    recent = observationDays(metric.observations, addDays(asOf, -2), asOf),
    current = median(recent.map((r) => r.value));
  const missing: string[] = [];
  if (
    baseline.maturity === 'insufficient' ||
    baseline.maturity === 'preliminary'
  )
    missing.push(
      'Personal baseline needs at least 14 valid days with sufficient coverage.',
    );
  if (recent.length < 2)
    missing.push(
      'At least two observations in the last three days are needed for a trend.',
    );
  if (!recent.some((r) => r.date >= addDays(asOf, -1)))
    missing.push('No observation from today or yesterday.');
  const delta =
    current !== null && baseline.median !== null
      ? current - baseline.median
      : null;
  const relative =
    delta !== null && baseline.median !== null && baseline.median !== 0
      ? delta / Math.abs(baseline.median)
      : null;
  const threshold =
    baseline.mad === null || baseline.median === null
      ? null
      : Math.max(
          recoveryEnginePolicy.madMultiplier * 1.4826 * baseline.mad,
          Math.abs(baseline.median) *
            recoveryEnginePolicy.relativeDeviationFloor,
        );
  if (threshold === 0)
    missing.push(
      'Zero-valued baseline has no defensible relative comparison scale.',
    );
  const comparable =
    ['developing', 'established'].includes(baseline.maturity) &&
    threshold !== null &&
    threshold > 0;
  const usable = missing.length === 0 && comparable;
  const direction =
    !comparable || delta === null
      ? 'unavailable'
      : Math.abs(delta) > threshold!
        ? delta > 0
          ? 'higher'
          : 'lower'
        : 'stable';
  let interpretation: RecoverySignal['interpretation'] = 'insufficient';
  if (usable) {
    if (metric.orientation === 'descriptive') interpretation = 'descriptive';
    else if (direction === 'stable') interpretation = 'usual_range';
    else
      interpretation =
        (direction === 'lower') === (metric.orientation === 'lower_suppressed')
          ? 'suppressed_pattern'
          : 'elevated_pattern';
  }
  const comparedRows = observationDays(
    metric.observations,
    baseline.start,
    asOf,
  );
  return {
    id: metric.id,
    name: metric.name,
    family: metric.family,
    unit: metric.unit,
    context: metric.context,
    baseline,
    recentDates: recent.map((r) => r.date),
    anomalyDates:
      comparable && metric.orientation !== 'descriptive'
        ? recent
            .filter((r) => Math.abs(r.value - baseline.median!) > threshold!)
            .map((r) => r.date)
        : [],
    recentMedian: current,
    delta,
    relativeDelta: relative,
    direction,
    interpretation,
    usableForState: usable && metric.orientation !== 'descriptive',
    quality: comparedRows.some((r) => r.quality === 'limited')
      ? 'limited'
      : 'recorded',
    missing,
  };
}
export function assessRecovery(
  input: RecoveryEngineInput,
): RecoveryEngineResult {
  const signals = input.metrics.map((m) => evaluateMetric(m, input.asOfDate));
  const families: RecoveryEngineResult['families'] = (
    [
      'autonomic',
      'sleep',
      'training_stress',
      'performance',
      'context',
    ] as RecoveryFamily[]
  ).map((family) => {
    const related = signals.filter((s) => s.family === family),
      ready = related.filter((s) => s.usableForState);
    const directions = new Set(ready.map((s) => s.interpretation));
    const direction =
      directions.has('suppressed_pattern') && directions.has('elevated_pattern')
        ? 'mixed'
        : directions.has('suppressed_pattern')
          ? 'suppressed'
          : directions.has('elevated_pattern')
            ? 'elevated'
            : directions.has('usual_range')
              ? 'stable'
              : 'unknown';
    const hasTraining =
      family === 'training_stress' &&
      input.training.some(
        (t) =>
          t.date <= input.asOfDate && t.date >= addDays(input.asOfDate, -89),
      );
    return {
      family,
      status: ready.length
        ? 'assessable'
        : hasTraining
          ? 'context_only'
          : related.some((s) => s.recentMedian !== null || s.baseline.count > 0)
            ? 'baseline_building'
            : 'missing',
      direction,
      contributes: false,
    };
  });
  const ready = families.filter((f) => f.status === 'assessable'),
    suppressed = ready.filter((f) => f.direction === 'suppressed'),
    elevated = ready.filter((f) => f.direction === 'elevated');
  const overnight = ready.some(
    (f) => f.family === 'autonomic' || f.family === 'sleep',
  );
  const anomalies = signals
    .filter((s) => s.anomalyDates.length > 0)
    .map((s) => s.id);
  let state: RecoveryEngineResult['state'] = 'insufficient_data',
    code: RecoveryEngineResult['explanation']['code'] = 'baseline_needed',
    text =
      'Insufficient valid overnight evidence. A personal baseline will develop prospectively as valid observations accumulate.';
  let contributors: RecoveryFamily[] = [];
  if (
    overnight &&
    suppressed.length >= 2 &&
    !elevated.length &&
    !ready.some((f) => f.direction === 'mixed')
  ) {
    state = 'possibly_suppressed';
    code = 'convergent_suppression';
    contributors = suppressed.map((f) => f.family);
    text =
      'Recent trends in independent families are below their usual personal pattern. This is a tentative statistical pattern, not a diagnosis or training prescription.';
  } else if (
    overnight &&
    elevated.length >= 2 &&
    !suppressed.length &&
    !ready.some((f) => f.direction === 'mixed')
  ) {
    state = 'possibly_elevated';
    code = 'convergent_elevation';
    contributors = elevated.map((f) => f.family);
    text =
      'Recent trends in independent families are above their usual personal pattern. Elevated HRV is not automatically improved recovery or permission to train harder.';
  } else if (
    overnight &&
    ready.length >= 2 &&
    ready.every((f) => f.direction === 'stable') &&
    !anomalies.length
  ) {
    state = 'normal';
    code = 'usual_personal_range';
    contributors = ready.map((f) => f.family);
    text =
      'Recent trends in independent families are within their usual personal ranges. Missing context and sensor limitations still apply.';
  } else if (
    ready.some((f) => f.direction === 'mixed') ||
    (suppressed.length && elevated.length)
  ) {
    code = 'conflicting_evidence';
    text =
      'Available signals disagree. No integrated recovery classification is justified.';
  } else if (anomalies.length) {
    code = 'single_family_anomaly';
    text =
      'An unusual observation or trend is visible, but independent evidence does not converge. No integrated recovery classification is justified.';
  } else if (ready.length) {
    code = 'independent_evidence_needed';
    text =
      'One family has a usable personal comparison; another independent family is needed for an integrated recovery state.';
  }
  families.forEach((f) => {
    f.contributes = contributors.includes(f.family);
  });
  const eligible = input.training.filter((t) => t.date <= input.asOfDate),
    recentTraining = eligible.filter(
      (t) => t.date >= addDays(input.asOfDate, -6),
    ),
    running = recentTraining.filter((t) =>
      ['run', 'trail_run'].includes(t.sport),
    ),
    last = [...eligible].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const ranks = [
    'insufficient',
    'preliminary',
    'developing',
    'established',
  ] as const;
  const physiological = signals.filter(
    (s) => s.family === 'autonomic' || s.family === 'sleep',
  );
  const maturity =
    ranks[
      Math.max(
        0,
        ...physiological
          .filter((s) => s.baseline.count)
          .map((s) => ranks.indexOf(s.baseline.maturity)),
      )
    ];
  const confidence: RecoveryEngineResult['confidence'] =
    state === 'insufficient_data'
      ? ready.length || anomalies.length
        ? 'low'
        : 'insufficient'
      : signals
            .filter((s) => contributors.includes(s.family) && s.usableForState)
            .every(
              (s) =>
                s.quality === 'recorded' &&
                s.baseline.maturity === 'established',
            )
        ? 'moderate'
        : 'low';
  return {
    version: 1,
    asOfDate: input.asOfDate,
    state,
    confidence,
    baselineMaturity: maturity,
    families,
    signals,
    influentialSignals: [...signals]
      .filter((s) => s.recentMedian !== null)
      .sort(
        (a, b) =>
          Number(b.usableForState) - Number(a.usableForState) ||
          Math.abs(b.relativeDelta ?? 0) - Math.abs(a.relativeDelta ?? 0) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 3)
      .map((s) => s.id),
    anomalies,
    training: {
      loggedSessions7d: recentTraining.length,
      runningMinutes7d:
        running.length && running.every((t) => t.durationMinutes !== null)
          ? running.reduce((sum, t) => sum + t.durationMinutes!, 0)
          : null,
      gymExposures7d: recentTraining.filter((t) => t.sport === 'strength')
        .length,
      completedGymSets7d: recentTraining.some(
        (t) => t.completedSets !== undefined,
      )
        ? recentTraining.reduce((sum, t) => sum + (t.completedSets ?? 0), 0)
        : null,
      daysSinceLastLoggedSession: last
        ? Math.round(
            (Date.parse(input.asOfDate + 'T00:00:00Z') -
              Date.parse(last.date + 'T00:00:00Z')) /
              86400000,
          )
        : null,
      highIntensitySessions7d: null,
    },
    missing: [
      ...input.limitations,
      ...families
        .filter((f) => f.status === 'missing')
        .map((f) => `${f.family}: no eligible comparable observations.`),
    ],
    explanation: {
      code,
      text,
      families: contributors,
      signalIds: signals
        .filter((s) => contributors.includes(s.family) && s.usableForState)
        .map((s) => s.id),
    },
    policy: recoveryEnginePolicy,
  };
}
