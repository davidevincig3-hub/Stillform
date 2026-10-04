import type {
  Confidence,
  EvidenceContribution,
  WorkoutSet,
} from '../domain/models';
const confidenceOrder: Confidence[] = ['insufficient', 'low', 'medium', 'high'];
export function weakestConfidence(inputs: Confidence[]): Confidence {
  return inputs.length
    ? confidenceOrder[
        Math.min(...inputs.map((c) => confidenceOrder.indexOf(c)))
      ]
    : 'insufficient';
}
export function influentialMetrics(
  evidence: EvidenceContribution[],
  count = 3,
) {
  return [...evidence]
    .sort((a, b) => b.influence - a.influence)
    .slice(0, count);
}
// Descriptive workload only: not a fatigue or hypertrophy score.
export function completedVolume(sets: WorkoutSet[]) {
  return sets
    .filter((s) => s.completed)
    .reduce((total, s) => total + (s.weight ?? 0) * (s.reps ?? 0), 0);
}
