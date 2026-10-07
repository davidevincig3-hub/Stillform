import { z } from 'zod';
import type { GymStore } from './gym-storage';
import { recentExercises } from '../analytics/gym-shortlist';
import { weeklyGymSummary, realHistory } from '../analytics/gym';
import {
  gymPerformance,
  type GymPerformance,
} from '../analytics/gym-performance';
import {
  findExerciseHistory,
  findWorkoutHistory,
} from '../analytics/gym-history';
export const gymReadQuerySchema = z.object({
  scope: z
    .enum(['workspace', 'history', 'exercise', 'workout', 'all', 'evidence'])
    .default('workspace'),
  page: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  id: z.string().optional(),
  query: z.string().default(''),
  title: z.string().default(''),
  from: z.string().default(''),
  to: z.string().default(''),
});
export type GymReadQuery = Partial<z.infer<typeof gymReadQuerySchema>>;
export interface GymReadSummary {
  total: number;
  titles: string[];
  shortlist: ReturnType<typeof recentExercises>;
  exerciseHistory: ReturnType<typeof findExerciseHistory>;
  weekly: ReturnType<typeof weeklyGymSummary>;
  performance?: GymPerformance;
}
export function selectGymView(store: GymStore, input: GymReadQuery = {}) {
  const q = gymReadQuerySchema.parse(input);
  let history = realHistory(store.history);
  if (q.scope === 'history')
    history = findWorkoutHistory(history, q.query, q.title, q.from, q.to);
  if (q.scope === 'exercise')
    history = history.filter((w) =>
      w.exercises.some((e) => e.exerciseId === q.id),
    );
  if (q.scope === 'workout') history = history.filter((w) => w.id === q.id);
  if (q.scope === 'evidence')
    history = history.filter(
      (w) => Date.parse(w.startedAt) >= Date.now() - 90 * 86400000,
    );
  const summary: GymReadSummary = {
    total: history.length,
    titles: [...new Set(store.history.map((w) => w.routineName))].sort(),
    shortlist: recentExercises(store),
    exerciseHistory: findExerciseHistory(store.exercises, store.history),
    weekly: weeklyGymSummary(store.history),
    ...(q.scope === 'exercise' && q.id
      ? { performance: gymPerformance(store.history, q.id) }
      : {}),
  };
  const selected =
    q.scope === 'all' || q.scope === 'evidence'
      ? history
      : history.slice(
          q.scope === 'workspace' ? 0 : q.page * q.limit,
          q.scope === 'workspace' ? 3 : (q.page + 1) * q.limit,
        );
  return {
    store: {
      ...store,
      history: selected,
      legacyArchive: q.scope === 'all' ? store.legacyArchive : [],
    },
    summary,
  };
}
