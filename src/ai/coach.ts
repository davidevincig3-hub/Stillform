import type { ChartContext } from '../domain/models';
import type { TrainingRepository } from '../repositories/contracts';
import type { ResearchProvider } from '../research/provider';
export interface CoachContext {
  page: string;
  chart?: ChartContext;
  activityId?: string;
  sessionId?: string;
}
export interface CoachResponse {
  text: string;
  personalEvidence: string[];
  scientificEvidence: string[];
  modelReasoning: string[];
  isMock: boolean;
}
export interface Coach {
  ask(question: string, context: CoachContext): Promise<CoachResponse>;
}
// Complete capability, selective retrieval: tools are repository methods, not a database dump.
export interface CoachDependencies {
  repository: TrainingRepository;
  research: ResearchProvider;
}
export const mockCoach: Coach = {
  async ask(question, context) {
    return {
      text: `Demo only. Your question about ${context.page} has not been analyzed: “${question}”. A future coach will retrieve relevant personal evidence and disclose research availability.`,
      personalEvidence: [],
      scientificEvidence: [],
      modelReasoning: [],
      isMock: true,
    };
  },
};
