import type { PolarStore } from './polar';
import { isRecoveryEligible, observationCounts } from './observation-quality';

export const recoveryFamilies = [
  'sleep',
  'nightly',
  'continuous',
  'ppi',
] as const;
// Shared eligibility boundary for future Home/engine consumers. This is not an engine.
export function recoveryInputs(state: PolarStore) {
  return {
    sleep: state.sleep.filter(isRecoveryEligible),
    nightly: state.nightly.filter(isRecoveryEligible),
    continuous: state.continuous.filter(isRecoveryEligible),
    ppi: state.ppi.filter(isRecoveryEligible),
  };
}
export function recoveryRecordCounts(state: PolarStore) {
  return {
    sleep: observationCounts(state.sleep),
    nightly: observationCounts(state.nightly),
    continuous: observationCounts(state.continuous),
    ppi: observationCounts(state.ppi),
  };
}
