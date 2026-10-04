import type {
  Assessment,
  ContextEvent,
  PlannedSession,
  Recommendation,
  ScheduleConstraint,
} from '../domain/models';
export interface DecisionInput {
  session: PlannedSession;
  recovery: Assessment;
  trainingLoad: Assessment;
  running: Assessment;
  resistance: Assessment;
  context: ContextEvent[];
  constraints: ScheduleConstraint[];
}
export interface ProgressionGates {
  personalData: 'supported' | 'unsupported' | 'insufficient';
  scientificRationale: 'supported' | 'unsupported' | 'unverified';
  reasons: string[];
}
export interface CandidateEvaluation {
  recommendation: Recommendation;
  stimulusPreservation: string;
  recoverySuitability: string;
  interference: string;
  scheduleDisruption: string;
  scientificRationale: string;
  uncertainty: string;
}
export interface DecisionEngine {
  evaluate(input: DecisionInput): Promise<{
    status: 'unavailable' | 'evaluated';
    candidates: Recommendation[];
    gates: ProgressionGates;
  }>;
}
export const decisionEngine: DecisionEngine = {
  async evaluate() {
    return {
      status: 'unavailable',
      candidates: [],
      gates: {
        personalData: 'insufficient',
        scientificRationale: 'unverified',
        reasons: [
          'Decision engine not implemented. No automatic plan changes.',
        ],
      },
    };
  },
};
export interface IntraWorkoutObservation {
  sessionId: string;
  anomalousSetIds: string[];
  recovery: Assessment;
  recentLoad: Assessment;
}
export interface IntraWorkoutCoach {
  observe(input: IntraWorkoutObservation): Promise<Recommendation[]>;
}
