import type { Source } from '../domain/models';
export const fieldPrecedence: Record<string, Source[]> = {
  runningHr: ['polar', 'strava', 'manual'],
  route: ['strava', 'polar', 'manual'],
  activityRegistry: ['strava', 'polar', 'internal', 'hevy', 'manual'],
  gymSets: ['internal', 'hevy'],
};
export interface DuplicateCandidate {
  existingActivityId: string;
  incomingRecordId: string;
  reasons: string[];
  confidence: 'high' | 'medium' | 'low';
  reviewRequired: boolean;
}
export interface DeduplicationService {
  findCandidates(rawRecordId: string): Promise<DuplicateCandidate[]>;
  merge(candidate: DuplicateCandidate, approved: boolean): Promise<void>;
}
// Field precedence is a starting policy; actual merging must also consider quality.
