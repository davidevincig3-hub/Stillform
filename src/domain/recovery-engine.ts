import type { ObservationQuality } from './observation-quality';

export type RecoveryFamily =
  'autonomic' | 'sleep' | 'training_stress' | 'performance' | 'context';
export type BaselineMaturity =
  'insufficient' | 'preliminary' | 'developing' | 'established';
export interface RecoveryObservation extends ObservationQuality {
  date: string;
  value: number;
  complete: boolean;
  quality: 'recorded' | 'limited';
  source: 'polar' | 'confirmed_activity' | 'confirmed_gym' | 'user';
}
export interface RecoveryMetric {
  id: string;
  name: string;
  family: RecoveryFamily;
  unit: string;
  context: string;
  // Descriptive metrics cannot vote on a physiological pattern.
  orientation: 'lower_suppressed' | 'higher_suppressed' | 'descriptive';
  observations: RecoveryObservation[];
}
export interface RecoveryBaseline {
  start: string;
  end: string;
  dates: string[];
  count: number;
  spanDays: number;
  coverage: number;
  median: number | null;
  mad: number | null;
  maturity: BaselineMaturity;
}
export interface RecoverySignal {
  id: string;
  name: string;
  family: RecoveryFamily;
  unit: string;
  context: string;
  baseline: RecoveryBaseline;
  recentDates: string[];
  anomalyDates: string[];
  recentMedian: number | null;
  delta: number | null;
  relativeDelta: number | null;
  direction: 'higher' | 'lower' | 'stable' | 'unavailable';
  interpretation:
    | 'suppressed_pattern'
    | 'elevated_pattern'
    | 'usual_range'
    | 'descriptive'
    | 'insufficient';
  usableForState: boolean;
  quality: 'recorded' | 'limited';
  missing: string[];
}
export interface TrainingExposure {
  id?: string;
  localWorkoutId?: string | null;
  completedSets?: number;
  date: string;
  sport: string;
  durationMinutes: number | null;
  source: 'confirmed_activity' | 'confirmed_gym';
}
export interface RecoveryEngineInput {
  calendarTimeZone?: string;
  asOfDate: string;
  metrics: RecoveryMetric[];
  training: TrainingExposure[];
  limitations: string[];
}
export interface RecoveryEngineResult {
  version: 1;
  asOfDate: string;
  state:
    | 'insufficient_data'
    | 'normal'
    | 'possibly_suppressed'
    | 'possibly_elevated';
  confidence: 'insufficient' | 'low' | 'moderate';
  baselineMaturity: BaselineMaturity;
  families: {
    family: RecoveryFamily;
    status: 'missing' | 'context_only' | 'baseline_building' | 'assessable';
    direction: 'suppressed' | 'elevated' | 'stable' | 'mixed' | 'unknown';
    contributes: boolean;
  }[];
  signals: RecoverySignal[];
  influentialSignals: string[];
  anomalies: string[];
  training: {
    loggedSessions7d: number;
    runningMinutes7d: number | null;
    gymExposures7d: number;
    completedGymSets7d: number | null;
    daysSinceLastLoggedSession: number | null;
    highIntensitySessions7d: number | null;
  };
  missing: string[];
  explanation: {
    code:
      | 'baseline_needed'
      | 'independent_evidence_needed'
      | 'single_family_anomaly'
      | 'conflicting_evidence'
      | 'convergent_suppression'
      | 'convergent_elevation'
      | 'usual_personal_range';
    text: string;
    families: RecoveryFamily[];
    signalIds: string[];
  };
  policy: {
    label: string;
    baselineDays: number;
    recentDays: number;
    minimumRecentObservations: number;
    relativeDeviationFloor: number;
    madMultiplier: number;
  };
}
