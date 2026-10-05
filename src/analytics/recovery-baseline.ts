import type {
  RecoveryBaseline,
  RecoveryObservation,
  BaselineMaturity,
} from '../domain/recovery-engine';
import { isRecoveryEligible } from '../domain/observation-quality';
import { addDays } from '../domain/polar';

export const recoveryMaturityPolicy = {
  preliminary: 7,
  developing: 14,
  established: 28,
};
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function observationDays(
  observations: RecoveryObservation[],
  start: string,
  end: string,
) {
  const groups = new Map<string, RecoveryObservation[]>();
  for (const o of observations)
    if (
      isRecoveryEligible(o) &&
      o.complete &&
      Number.isFinite(o.value) &&
      /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
      o.date >= start &&
      o.date <= end
    )
      groups.set(o.date, [...(groups.get(o.date) ?? []), o]);
  // Repeated measurements on one date are not additional baseline nights.
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      ...rows[0],
      date,
      value: median(rows.map((r) => r.value))!,
      quality: rows.some((r) => r.quality === 'limited')
        ? ('limited' as const)
        : ('recorded' as const),
    }));
}
export function temporalMaturity(
  count: number,
  spanDays: number,
  coverage: number,
  policy = recoveryMaturityPolicy,
): BaselineMaturity {
  if (count >= policy.established && spanDays >= 28 && coverage >= 0.7)
    return 'established';
  if (count >= policy.developing && spanDays >= 14 && coverage >= 0.5)
    return 'developing';
  if (count >= policy.preliminary && spanDays >= 7 && coverage >= 0.25)
    return 'preliminary';
  return 'insufficient';
}
export function personalBaseline(
  observations: RecoveryObservation[],
  start: string,
  end: string,
  policy = recoveryMaturityPolicy,
): RecoveryBaseline {
  const rows = observationDays(observations, start, end),
    count = rows.length,
    center = median(rows.map((r) => r.value));
  const days =
    Math.round(
      (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) /
        86400000,
    ) + 1;
  const span = count
    ? Math.round(
        (Date.parse(rows.at(-1)!.date + 'T00:00:00Z') -
          Date.parse(rows[0].date + 'T00:00:00Z')) /
          86400000,
      ) + 1
    : 0;
  return {
    start,
    end,
    dates: rows.map((r) => r.date),
    count,
    spanDays: span,
    coverage: count / days,
    median: center,
    mad:
      center === null
        ? null
        : median(rows.map((r) => Math.abs(r.value - center))),
    maturity: temporalMaturity(count, span, count / days, policy),
  };
}
export function baselineForDay(
  observations: RecoveryObservation[],
  asOf: string,
) {
  // Prior 28 days, separated from the current three-day trend: no look-ahead.
  return personalBaseline(observations, addDays(asOf, -30), addDays(asOf, -3));
}
