import type {
  RecoveryEngineInput,
  RecoveryMetric,
} from '../../src/domain/recovery-engine';
import { addDays } from '../../src/domain/polar';
export const engineDay = '2026-10-05';
export function metricFixture(
  id: string,
  family: RecoveryMetric['family'],
  center: number,
  recent: number,
): RecoveryMetric {
  return {
    id,
    name: `Synthetic ${id}`,
    family,
    unit: 'synthetic unit',
    context: 'Controlled synthetic protocol',
    orientation: 'lower_suppressed',
    observations: [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: addDays(engineDay, i - 30),
        value: center + ((i % 3) - 1) * center * 0.01,
        complete: true,
        quality: 'recorded' as const,
        source: 'user' as const,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        date: addDays(engineDay, i - 2),
        value: recent,
        complete: true,
        quality: 'recorded' as const,
        source: 'user' as const,
      })),
    ],
  };
}
export function engineFixture(
  metrics: RecoveryMetric[] = [],
): RecoveryEngineInput {
  return {
    asOfDate: engineDay,
    calendarTimeZone: 'Europe/Rome',
    metrics,
    training: [],
    limitations: [],
  };
}
