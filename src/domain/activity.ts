import { z } from 'zod';
export const sportSchema = z.enum([
  'run',
  'trail_run',
  'cycling',
  'swimming',
  'walking',
  'hiking',
  'strength',
  'other',
]);
export type Sport = z.infer<typeof sportSchema>;
export const canonicalActivitySchema = z.object({
  id: z.string(),
  sport: sportSchema,
  title: z.string(),
  startedAt: z.iso.datetime(),
  localStart: z.string().nullable(),
  timeZone: z.string().nullable(),
  elapsedSeconds: z.number().nonnegative().nullable(),
  movingSeconds: z.number().nonnegative().nullable(),
  distanceM: z.number().nonnegative().nullable(),
  elevationM: z.number().nonnegative().nullable(),
  averageHr: z.number().nonnegative().nullable(),
  maxHr: z.number().nonnegative().nullable(),
  averageSpeed: z.number().nonnegative().nullable(),
  device: z.string().nullable(),
  status: z.enum(['confirmed', 'review', 'source_deleted']),
  quality: z.object({
    available: z.array(z.string()),
    missing: z.array(z.string()),
    confidence: z.enum(['recorded', 'limited']),
  }),
  fieldSources: z.record(z.string(), z.string()),
  sourceKeys: z.array(z.string()),
  gymWorkoutId: z.string().nullable(),
  plannedSessionId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CanonicalActivity = z.infer<typeof canonicalActivitySchema>;
export const activitySourceSchema = z.object({
  key: z.string(),
  provider: z.enum(['strava', 'polar', 'hevy', 'internal', 'manual']),
  externalId: z.string(),
  athleteId: z.string().nullable(),
  activityId: z.string(),
  providerType: z.string(),
  syncedAt: z.iso.datetime(),
  device: z.string().nullable(),
  fingerprint: z.string(),
  deleted: z.boolean(),
  raw: z.record(z.string(), z.unknown()),
  previous: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type ExternalActivitySource = z.infer<typeof activitySourceSchema>;
export const gymLinkSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  durationMinutes: z.number().nonnegative().nullable(),
  source: z.enum(['hevy_import', 'local_logger', 'legacy_v1']),
});
export type GymLink = z.infer<typeof gymLinkSchema>;
export const registrySchema = z.object({
  version: z.literal(1),
  activities: z.array(canonicalActivitySchema),
  sources: z.array(activitySourceSchema),
  reviews: z.array(
    z.object({
      sourceKey: z.string(),
      incomingId: z.string(),
      candidates: z.array(
        z.object({
          activityId: z.string(),
          confidence: z.enum(['high', 'possible']),
          reasons: z.array(z.string()),
        }),
      ),
    }),
  ),
  decisions: z.record(
    z.string(),
    z.object({
      action: z.enum(['link', 'separate']),
      targetId: z.string().nullable(),
      decidedAt: z.iso.datetime(),
    }),
  ),
  aliases: z.record(z.string(), z.string()),
  sync: z.object({
    page: z.number().int().positive(),
    before: z.number(),
    after: z.number(),
    done: z.boolean(),
    discovered: z.number(),
    created: z.number(),
    linked: z.number(),
    review: z.number(),
    errors: z.array(z.string()),
    blockedUntil: z.number(),
    lastRequestAt: z.number(),
  }),
});
export type ActivityRegistry = z.infer<typeof registrySchema>;
export function emptyRegistry(): ActivityRegistry {
  return {
    version: 1,
    activities: [],
    sources: [],
    reviews: [],
    decisions: {},
    aliases: {},
    sync: {
      page: 1,
      before: 0,
      after: 0,
      done: false,
      discovered: 0,
      created: 0,
      linked: 0,
      review: 0,
      errors: [],
      blockedUntil: 0,
      lastRequestAt: 0,
    },
  };
}
export interface NormalizedStream {
  kind:
    | 'time'
    | 'distance'
    | 'latlng'
    | 'altitude'
    | 'velocity_smooth'
    | 'heartrate'
    | 'cadence'
    | 'moving'
    | 'grade_smooth';
  data: (number | boolean | [number, number])[];
  seriesType: string;
  resolution: string;
  originalSize: number | null;
}
export interface ActivityLap {
  index: number;
  startedAt: string | null;
  elapsedSeconds: number | null;
  movingSeconds: number | null;
  distanceM: number | null;
  averageSpeed: number | null;
  averageHr: number | null;
  maxHr: number | null;
  sourceKey: string;
  raw: Record<string, unknown>;
}
export interface RichActivityData {
  sourceKey: string;
  fetchedAt: string;
  streams: NormalizedStream[];
  laps: ActivityLap[];
  warnings: string[];
}
