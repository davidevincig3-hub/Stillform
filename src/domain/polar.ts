import { z } from 'zod';
export const polarFamilies = [
  'training',
  'sleep',
  'nightly',
  'continuous',
  'ppi',
] as const;
export type PolarFamily = (typeof polarFamilies)[number];
export const polarScopes = [
  'training_sessions:read',
  'sleep:read',
  'nightly_recharge:read',
  'continuous_samples:read',
  'ppi_data:read',
  'devices:read',
  'sports:read',
] as const;
export const familyScope: Record<PolarFamily, string> = {
  training: polarScopes[0],
  sleep: polarScopes[1],
  nightly: polarScopes[2],
  continuous: polarScopes[3],
  ppi: polarScopes[4],
};
export const windowDays: Record<PolarFamily, number> = {
  training: 90,
  sleep: 30,
  nightly: 28,
  continuous: 30,
  ppi: 90,
};
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
const date = z.iso.date();
const nullableNumber = z.number().finite().nullable();
const record = z.record(z.string(), z.unknown());
const base = {
  date,
  source: z.literal('polar'),
  syncedAt: z.iso.datetime(),
  raw: record,
  previous: z.array(record).default([]),
  device: z.string().nullable(),
  sensorQuality: z.literal('unknown'),
};
export const sleepSchema = z.object({
  ...base,
  start: z.string().nullable(),
  end: z.string().nullable(),
  asleepSeconds: nullableNumber,
  spanSeconds: nullableNumber,
  continuity: nullableNumber,
  efficiencyPercent: nullableNumber,
  interruptions: nullableNumber,
  awakeSeconds: nullableNumber,
  phaseSeconds: z.record(z.string(), nullableNumber),
  vendorSleepScore: nullableNumber,
  userModified: z.boolean(),
  complete: z.boolean(),
});
export const nightlySchema = z.object({
  ...base,
  rmssdMs: nullableNumber,
  rriMs: nullableNumber,
  respirationIntervalMs: nullableNumber,
  vendor: record,
});
export const continuousSchema = z.object({
  ...base,
  samples: z.array(
    z.object({
      offsetMillis: nullableNumber,
      timestamp: z.null(),
      heartRate: nullableNumber,
      triggerType: z.unknown(),
    }),
  ),
});
export const ppiSchema = z.object({
  ...base,
  samples: z.array(
    z.object({
      offsetMillis: nullableNumber,
      timestamp: z.null(),
      intervalMs: nullableNumber,
      errorEstimateMs: nullableNumber,
      skinContact: z.unknown(),
      movement: z.unknown(),
      offline: z.unknown(),
    }),
  ),
  triggers: z.array(record),
});
export type PolarSleep = z.infer<typeof sleepSchema>;
export type PolarNightly = z.infer<typeof nightlySchema>;
export const polarDiagnosticSchema = z.object({
  endpoint: z.string(),
  status: z.number().int(),
  contentType: z.string().nullable(),
  body: z.string().max(4000),
  refreshed: z.boolean(),
  refreshAttempted: z.boolean().default(false),
  family: z.enum([...polarFamilies, 'context', 'authentication']),
});
export type PolarDiagnostic = z.infer<typeof polarDiagnosticSchema>;
export const jobSchema = z.object({
  from: date,
  to: date,
  next: date,
  phase: z.enum(['discover', 'hydrate']),
  pending: z.array(date),
  done: z.boolean(),
  unavailable: z.boolean(),
  requests: z.number().int().nonnegative(),
  emptyWindows: z.array(z.object({ from: date, to: date })),
  oldest: date.nullable(),
  newest: date.nullable(),
  lastSuccess: z.iso.datetime().nullable(),
  errors: z.array(z.string()),
  diagnostic: polarDiagnosticSchema.nullable().default(null),
});
export type PolarJob = z.infer<typeof jobSchema>;
export const polarStoreSchema = z.object({
  version: z.literal(1),
  realMode: z.boolean(),
  jobs: z.partialRecord(z.enum(polarFamilies), jobSchema),
  sleep: z.array(sleepSchema),
  nightly: z.array(nightlySchema),
  continuous: z.array(continuousSchema),
  ppi: z.array(ppiSchema),
  sports: z.array(record),
  devices: record,
  metadataSyncedAt: z.iso.datetime().nullable(),
  blockedUntil: z.number(),
  lastRequestAt: z.number(),
  contextDiagnostic: polarDiagnosticSchema.nullable().default(null),
});
export type PolarStore = z.infer<typeof polarStoreSchema>;
export function emptyPolarStore(): PolarStore {
  return {
    version: 1,
    realMode: false,
    jobs: {},
    sleep: [],
    nightly: [],
    continuous: [],
    ppi: [],
    sports: [],
    devices: {},
    metadataSyncedAt: null,
    blockedUntil: 0,
    lastRequestAt: 0,
    contextDiagnostic: null,
  };
}
export function newPolarJob(from: string, to: string): PolarJob {
  return jobSchema.parse({
    from,
    to,
    next: from,
    phase: 'discover',
    pending: [],
    done: false,
    unavailable: false,
    requests: 0,
    emptyWindows: [],
    oldest: null,
    newest: null,
    lastSuccess: null,
    errors: [],
  });
}
export interface PolarFeatures {
  exercises: {
    id: string | null;
    runningIndex: number | null;
    trainingLoad: Record<string, unknown>;
    samples: {
      type: string;
      unit: string;
      intervalMillis: number | null;
      values: (number | null)[];
    }[];
    zones: Record<string, unknown>[];
    pauses: Record<string, unknown>[];
    routes: Record<string, unknown>;
    statistics: Record<string, unknown>;
  }[];
  raw: Record<string, unknown>;
  sensorQuality: 'unknown';
}
