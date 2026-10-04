import type { Confidence, SourceReference } from './models';
export interface RunningInterval {
  id: string;
  order: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
  hrAverage: number | null;
  hrMax: number | null;
  timeInTargetIntensitySeconds: number | null;
  hrRecoveryBpm: number | null;
  sourceReferences: SourceReference[];
  confidence: Confidence;
}
export interface HighIntensityAnalysis {
  activityId: string;
  protocol: '4x4' | 'other';
  intervals: RunningInterval[];
  paceDecayPercent: number | null;
  repeatConsistency: { description: string; calculationVersion: string } | null;
  confidence: Confidence;
  inputReferences: string[];
  calculationVersion: string;
}
export interface VendorRunningSignal {
  provider: 'polar';
  name: 'Running Index';
  value: number | null;
  recordedAt: string;
  sourceReferences: SourceReference[];
  confidence: Confidence;
}
