import type {
  Activity,
  Assessment,
  Baseline,
  ActivityStream,
  ChartContext,
  ContextEvent,
  DecisionOutcome,
  DerivedMetric,
  Goal,
  GymSession,
  PlannedSession,
  RawRecord,
  Routine,
  ScheduleConstraint,
} from '../domain/models';
export interface TrainingRepository {
  getRawRecords(ids: string[]): Promise<RawRecord[]>;
  getBaselines(metric?: string): Promise<Baseline[]>;
  getAssessments(domain: string, days: number): Promise<Assessment[]>;
  getGoals(): Promise<Goal[]>;
  getRoutines(): Promise<Routine[]>;
  getDecisionOutcomes(): Promise<DecisionOutcome[]>;
  getRecoveryHistory(days: number): Promise<ChartContext[]>;
  getMetricHistory(name: string, days: number): Promise<DerivedMetric[]>;
  getActivities(filter: {
    type?: Activity['type'];
    from?: string;
    to?: string;
  }): Promise<Activity[]>;
  getActivityStreams(id: string): Promise<ActivityStream[]>;
  getExerciseHistory(name: string, exposures: number): Promise<GymSession[]>;
  getGymSession(id: string): Promise<GymSession | null>;
  compareActivities(ids: string[]): Promise<ChartContext[]>;
  comparePeriods(
    metric: string,
    periods: { from: string; to: string }[],
  ): Promise<ChartContext[]>;
  getTrainingPlan(): Promise<PlannedSession[]>;
  getCalendarContext(): Promise<ScheduleConstraint[]>;
  getContextEvents(): Promise<ContextEvent[]>;
  runAnalyticsQuery(query: {
    metric: string;
    days: number;
  }): Promise<ChartContext>;
  saveGoal(goal: Goal): Promise<void>;
  saveDecision(outcome: DecisionOutcome): Promise<void>;
}
