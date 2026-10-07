import { performanceHistory } from './gym-performance';
import { trendDateOffset } from '../../src/analytics/gym-trend';
export const trendAsOf = '2026-10-07';
export function trendHistory(asOf = trendAsOf) {
  const store = performanceHistory(16);
  store.history.forEach((w, i) => {
    w.startedAt = `${trendDateOffset(asOf, (i - 15) * 7)}T10:00:00.000Z`;
    w.endedAt = `${trendDateOffset(asOf, (i - 15) * 7)}T11:00:00.000Z`;
    w.exercises[0].primaryMuscleGroup = 'Back';
    w.exercises[0].sets[0].weight = 50 + 2 * i;
    w.exercises[0].sets[0].reps = 10;
    w.exercises[0].sets[0].rir = null;
  });
  return store;
}
