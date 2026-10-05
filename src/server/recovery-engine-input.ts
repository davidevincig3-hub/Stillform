import 'server-only';
import type { PolarStore } from '../domain/polar';
import type { ActivityRegistry } from '../domain/activity';
import type {
  RecoveryEngineInput,
  RecoveryMetric,
} from '../domain/recovery-engine';
import { recoveryInputs } from '../domain/recovery-inputs';
import { polarCalendarDate } from '../domain/polar-training-range';
import { assessRecovery } from '../analytics/recovery-engine';
import { addDays } from '../domain/polar';
import { median } from '../analytics/recovery-baseline';

export function polarRecoveryEngineInput(
  state: PolarStore,
  registry: ActivityRegistry,
  asOf: string,
  timeZone: string,
): RecoveryEngineInput {
  const valid = recoveryInputs(state),
    metrics: RecoveryMetric[] = [],
    asOfDate = polarCalendarDate(new Date(asOf), timeZone);
  function metric(
    id: string,
    name: string,
    family: RecoveryMetric['family'],
    unit: string,
    orientation: RecoveryMetric['orientation'],
    rows: {
      date: string;
      device: string | null;
      complete?: boolean;
      value: number | null;
      validityOverride?:
        import('../domain/observation-quality').ValidityOverride | null;
    }[],
  ) {
    const contexts = new Map<string, typeof rows>();
    for (const r of rows)
      if (r.value !== null && Number.isFinite(r.value))
        contexts.set(r.device ?? 'unspecified-device', [
          ...(contexts.get(r.device ?? 'unspecified-device') ?? []),
          r,
        ]);
    for (const [device, observations] of contexts)
      metrics.push({
        id: `${id}:${device}`,
        name,
        family,
        unit,
        orientation,
        context: `Polar ${id}; consistent device context; sensor accuracy unknown`,
        observations: observations.map((r) => ({
          date: r.date,
          value: r.value!,
          complete: r.complete ?? true,
          validityOverride: r.validityOverride,
          quality: 'limited',
          source: 'polar',
        })),
      });
  }
  metric(
    'rmssd',
    'Nightly RMSSD',
    'autonomic',
    'ms',
    'lower_suppressed',
    valid.nightly.map((n) => ({
      ...n,
      value: n.rmssdMs !== null && n.rmssdMs > 0 ? n.rmssdMs : null,
    })),
  );
  metric(
    'rri',
    'Nightly RRI (secondary)',
    'autonomic',
    'ms',
    'descriptive',
    valid.nightly.map((n) => ({ ...n, value: n.rriMs })),
  );
  metric(
    'respiration_interval',
    'Respiration interval (secondary)',
    'autonomic',
    'ms',
    'descriptive',
    valid.nightly.map((n) => ({ ...n, value: n.respirationIntervalMs })),
  );
  metric(
    'sleep_duration',
    'Sleep duration',
    'sleep',
    'h',
    'lower_suppressed',
    valid.sleep.map((n) => ({
      ...n,
      value: n.asleepSeconds === null ? null : n.asleepSeconds / 3600,
    })),
  );
  metric(
    'sleep_continuity',
    'Sleep continuity',
    'sleep',
    'vendor index',
    'lower_suppressed',
    valid.sleep.map((n) => ({ ...n, value: n.continuity })),
  );
  const bedtimes = valid.sleep.map((n) => {
    const clock = n.start?.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
    return {
      ...n,
      value: clock
        ? (Number(clock[1]) * 60 + Number(clock[2]) + 720) % 1440
        : null,
    };
  });
  metric(
    'sleep_timing',
    'Bedtime from local noon',
    'sleep',
    'min',
    'descriptive',
    bedtimes,
  );
  const regularity = bedtimes.map((n) => {
    const window = bedtimes.filter(
        (r) =>
          r.complete &&
          r.device === n.device &&
          r.value !== null &&
          r.date >= addDays(n.date, -6) &&
          r.date <= n.date,
      ),
      center = median(window.map((r) => r.value!));
    return {
      ...n,
      value:
        window.length >= 3 && center !== null
          ? median(window.map((r) => Math.abs(r.value! - center)))
          : null,
    };
  });
  metric(
    'sleep_regularity',
    'Bedtime variability (7-day median absolute deviation)',
    'sleep',
    'min',
    'descriptive',
    regularity,
  );
  const sources = new Map(registry.sources.map((s) => [s.key, s]));
  const training = registry.activities
    .filter(
      (a) =>
        a.status === 'confirmed' &&
        Date.parse(a.startedAt) <= Date.parse(asOf) &&
        a.sourceKeys.some((k) => {
          const s = sources.get(k);
          return s && !s.deleted;
        }),
    )
    .map((a) => ({
      id: a.id,
      localWorkoutId: a.gymWorkoutId,
      date: polarCalendarDate(new Date(a.startedAt), timeZone),
      sport: a.sport,
      durationMinutes: a.elapsedSeconds === null ? null : a.elapsedSeconds / 60,
      source: 'confirmed_activity' as const,
    }));
  return {
    calendarTimeZone: timeZone,
    asOfDate,
    metrics,
    training,
    limitations: [
      'No validated night/resting HR or respiratory-rate observation is available; RRI and respiratory intervals remain native secondary signals.',
      'Continuous daytime BPM and PPI are not substituted for nightly HRV; PPI context/quality validation is not implemented.',
      'Training exposure is descriptive logged history, not physiological load. Missing records do not prove rest. High-intensity identification is unavailable.',
      'No validated comparable performance series is supplied. Gym load/reps/effort protocols and running comparability are required before performance can contribute.',
      'Context is unavailable and is not counted as negative evidence. Product deviation and maturity heuristics are not scientifically validated.',
    ],
  };
}
export function polarRecoveryAssessment(
  state: PolarStore,
  registry: ActivityRegistry,
  asOf: string,
  timeZone: string,
) {
  return assessRecovery(
    polarRecoveryEngineInput(state, registry, asOf, timeZone),
  );
}
