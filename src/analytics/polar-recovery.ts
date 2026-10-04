import type { PolarSleep, PolarNightly } from '../domain/polar';
export const maturityPolicy = {
  preliminary: 7,
  developing: 14,
  established: 28,
};
export function baselineMaturity(count: number, policy = maturityPolicy) {
  return count >= policy.established
    ? 'established'
    : count >= policy.developing
      ? 'developing'
      : count >= policy.preliminary
        ? 'preliminary'
        : 'insufficient';
}
export interface RecoveryPoint {
  date: string;
  value: number | null;
  source: 'polar';
  complete: boolean;
}
export type PublicSleep = Omit<PolarSleep, 'raw' | 'previous'>;
export type PublicNightly = Omit<PolarNightly, 'raw' | 'previous'>;
export interface RecoveryData {
  realMode: boolean;
  connected: boolean;
  sleep: PublicSleep[];
  nightly: PublicNightly[];
  continuousDays: number;
  ppiDays: number;
  asOf: string;
}
export function recoverySeries(data: RecoveryData) {
  return [
    {
      name: 'Nightly RMSSD',
      unit: 'ms',
      context:
        'Polar Nightly Recharge · vendor-provided RMSSD, not reconstructed from BPM',
      points: data.nightly.map((n) => ({
        date: n.date,
        value: n.rmssdMs,
        source: 'polar' as const,
        complete: n.rmssdMs !== null,
      })),
    },
    {
      name: 'Nightly RRI',
      unit: 'ms',
      context:
        'Mean nightly recovery beat interval; not mean nightly heart rate',
      points: data.nightly.map((n) => ({
        date: n.date,
        value: n.rriMs,
        source: 'polar' as const,
        complete: n.rriMs !== null,
      })),
    },
    {
      name: 'Nightly respiration interval',
      unit: 'ms',
      context: 'Polar respiration interval; not breaths per minute',
      points: data.nightly.map((n) => ({
        date: n.date,
        value: n.respirationIntervalMs,
        source: 'polar' as const,
        complete: n.respirationIntervalMs !== null,
      })),
    },
    {
      name: 'Sleep duration',
      unit: 'h',
      context: 'Polar asleep duration · underlying signal',
      points: data.sleep.map((n) => ({
        date: n.date,
        value: n.asleepSeconds === null ? null : n.asleepSeconds / 3600,
        source: 'polar' as const,
        complete: n.complete,
      })),
    },
    {
      name: 'Sleep continuity',
      unit: 'vendor index',
      context:
        'Polar continuity index; a vendor sleep measure, not a Recovery score',
      points: data.sleep.map((n) => ({
        date: n.date,
        value: n.continuity,
        source: 'polar' as const,
        complete: n.complete,
      })),
    },
    {
      name: 'Sleep efficiency',
      unit: '%',
      context: 'Polar sleep efficiency · not readiness',
      points: data.sleep.map((n) => ({
        date: n.date,
        value: n.efficiencyPercent,
        source: 'polar' as const,
        complete: n.complete,
      })),
    },
  ];
}
export function windowSummary(
  points: RecoveryPoint[],
  days: number,
  asOf: string,
  policy = maturityPolicy,
) {
  const end = asOf.slice(0, 10),
    start = new Date(Date.parse(end + 'T00:00:00Z') - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
    byDay = new Map(
      points
        .filter((p) => p.date >= start && p.date <= end)
        .map((p) => [p.date, p]),
    );
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const values = dates.map(
      (d) =>
        byDay.get(d) ?? {
          date: d,
          value: null,
          source: 'polar' as const,
          complete: false,
        },
    ),
    observed = values.filter((p) => p.value !== null),
    complete = observed.filter((p) => p.complete),
    count = observed.length;
  return {
    points: values,
    count,
    completeCount: complete.length,
    coverage: count / days,
    maturity: baselineMaturity(complete.length, policy),
    referenceMean:
      complete.length >= policy.preliminary
        ? complete.reduce((sum, p) => sum + p.value!, 0) / complete.length
        : null,
    start,
    end,
  };
}
