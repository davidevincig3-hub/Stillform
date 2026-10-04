import type {
  Activity,
  Assessment,
  Baseline,
  DerivedMetric,
  GymSession,
  RawRecord,
} from '../domain/models';
export interface MetricCalculator {
  name: string;
  version: string;
  calculate(input: {
    activities: Activity[];
    sessions: GymSession[];
    raw: RawRecord[];
    baselines: Baseline[];
  }): Promise<DerivedMetric | null>;
}
export interface RecoveryEngine {
  assess(metrics: DerivedMetric[], baselines: Baseline[]): Promise<Assessment>;
}
export interface RunningAnalytics {
  compare(activities: Activity[]): Promise<DerivedMetric[]>;
}
export interface ResistanceAnalytics {
  compareExposures(
    exerciseId: string,
    sessions: GymSession[],
  ): Promise<DerivedMetric[]>;
}
