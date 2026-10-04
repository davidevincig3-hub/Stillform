import { z } from 'zod';
import type { ProgressionContext } from './progression';

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';
export type BaselineMaturity =
  'insufficient' | 'preliminary' | 'developing' | 'established';
export type EvidenceFamily =
  'autonomic' | 'sleep' | 'training-stress' | 'performance' | 'context';
export type Source =
  'polar' | 'strava' | 'internal' | 'hevy' | 'manual' | 'calendar';
export interface SourceReference {
  source: Source;
  externalId: string;
  recordedAt: string;
  sensor?: string;
  quality: Confidence;
}
export interface ProvenancedValue<T> {
  value: T;
  source: SourceReference;
  alternatives?: { value: T; source: SourceReference }[];
}
export interface RawRecord {
  id: string;
  userId: string;
  source: SourceReference;
  payload: unknown;
  receivedAt: string;
}
export interface RecoveryNight {
  id: string;
  userId: string;
  nightDate: string;
  hrv?: ProvenancedValue<number>;
  nightHr?: ProvenancedValue<number>;
  respiratoryRate?: ProvenancedValue<number>;
  sleepMinutes?: ProvenancedValue<number>;
  sleepStart?: ProvenancedValue<string>;
  sleepEnd?: ProvenancedValue<string>;
  awakeMinutes?: ProvenancedValue<number>;
  stageMinutes?: ProvenancedValue<Record<string, number>>;
  vendorSignals?: Record<string, ProvenancedValue<number>>;
}
export interface Activity {
  id: string;
  userId: string;
  type: 'running' | 'strength' | 'cycling' | 'swimming' | 'hiking' | 'other';
  title: string;
  startedAt: string;
  durationMinutes: number;
  distanceKm?: ProvenancedValue<number>;
  averageHr?: ProvenancedValue<number>;
  sources: SourceReference[];
  plannedSessionId?: string;
}
export interface ActivityStream {
  activityId: string;
  kind: 'hr' | 'pace' | 'gps' | 'elevation';
  samples: { elapsedSeconds: number; value: number | [number, number] }[];
  source: SourceReference;
}
export interface DerivedMetric {
  id: string;
  userId: string;
  name: string;
  value: number;
  unit: string;
  calculationVersion: string;
  calculatedAt: string;
  inputReferences: string[];
  quality: Confidence;
  confidence: Confidence;
  isMock: boolean;
}
export interface Baseline {
  metric: string;
  value: number;
  unit: string;
  observations: number;
  start: string;
  end: string;
  maturity: BaselineMaturity;
  confidence: Confidence;
}
export interface EvidenceContribution {
  family: EvidenceFamily;
  metric: string;
  displayValue: string;
  influence: number;
  confidence: Confidence;
  references: string[];
}
export interface Assessment {
  state: string;
  confidence: Confidence;
  explanation: string;
  evidence: EvidenceContribution[];
  isMock: boolean;
}
export interface Goal {
  id: string;
  originalText: string;
  interpretation: {
    objectives: string[];
    metricNames: string[];
    rationale: string;
  } | null;
}
export interface PlannedSession {
  id: string;
  date: string;
  title: string;
  type: Activity['type'];
  purpose: string;
  status: 'planned' | 'completed' | 'skipped' | 'adjusted';
}
export interface ContextEvent {
  id: string;
  occurredAt: string;
  kind: string;
  note: string;
}
export interface ScheduleConstraint {
  start: string;
  end: string;
  reason: string;
}
export interface Recommendation {
  id: string;
  sessionId: string;
  action:
    | 'proceed'
    | 'awareness'
    | 'adjust-dose'
    | 'alter-form'
    | 'reschedule'
    | 'stop';
  rationale: string;
  confidence: Confidence;
  alternatives: string[];
  evidenceReferences: string[];
  requiresApproval: boolean;
}
export interface DecisionOutcome {
  recommendationId: string;
  choice: 'accepted' | 'rejected';
  decidedAt: string;
  subsequentActivityIds: string[];
}
export const setSchema = z.object({
  id: z.string(),
  weight: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(1).max(200).nullable(),
  rir: z.number().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  failure: z.boolean(),
  completed: z.boolean(),
  loggedAt: z.string().nullable(),
});
export type WorkoutSet = z.infer<typeof setSchema>;
export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  muscleGroup: z.string(),
  previous: z.string(),
  sets: z.array(setSchema),
});
export type WorkoutExercise = z.infer<typeof exerciseSchema>;
export interface Routine {
  id: string;
  name: string;
  focus: string;
  exercises: {
    name: string;
    muscleGroup: string;
    previous: string;
    setCount: number;
  }[];
}
export const workoutSchema = z.object({
  id: z.string(),
  routineName: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  status: z.enum(['active', 'completed']),
  exercises: z.array(exerciseSchema),
});
export type GymSession = z.infer<typeof workoutSchema>;
export interface ChartContext {
  progression?: ProgressionContext;
  metric: string;
  unit: string;
  timeframeDays: number;
  points: { date: string; value: number }[];
  baseline: Baseline | null;
  confidence: Confidence;
  calculationVersion: string;
  isMock: boolean;
}
