import { z } from 'zod';

export const validityOverrideSchema = z.object({
  status: z.enum(['valid', 'excluded']),
  reason: z
    .enum(['sensor_artifact', 'incorrect_detection', 'other'])
    .nullable(),
  adjudicatedAt: z.iso.datetime(),
  adjudicatedBy: z.literal('user'),
});
export type ValidityOverride = z.infer<typeof validityOverrideSchema>;
export interface ObservationQuality {
  validityOverride?: ValidityOverride | null;
}
// No override preserves provider eligibility; completeness and metric availability
// remain independent checks. Unusual values alone never cause automatic exclusion.
export function isRecoveryEligible(observation: ObservationQuality) {
  return observation.validityOverride?.status !== 'excluded';
}
export function observationCounts(records: ObservationQuality[]) {
  const excluded = records.filter((r) => !isRecoveryEligible(r)).length;
  return {
    provider: records.length,
    valid: records.length - excluded,
    excluded,
  };
}
