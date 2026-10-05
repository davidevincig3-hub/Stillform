import 'server-only';
import { z } from 'zod';
import type {
  CanonicalActivity,
  ExternalActivitySource,
  ActivityLap,
} from '../domain/activity';
import type { PolarStore, PolarFamily, PolarFeatures } from '../domain/polar';
import { fingerprint } from './integration-security';
import { polarFallbackTitle } from '../domain/activity-presentation';
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(object) : [];
export const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const string = (value: unknown) => (typeof value === 'string' ? value : null);
const date = (value: unknown) => z.iso.date().parse(value);
// /sports/list returns a top-level array, not a { sports: [...] } envelope.
export function parsePolarSports(raw: unknown): PolarStore['sports'] {
  return z
    .array(
      z
        .object({
          id: z.object({ id: z.union([z.number().int(), z.string().min(1)]) }),
          name: z.string().min(1),
        })
        .passthrough(),
    )
    .parse(raw);
}
export function durationSeconds(value: unknown) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?s$/.test(value)) return null;
  return number(Number(value.slice(0, -1)));
}
export function polarTimestamp(value: unknown, offset: unknown) {
  if (typeof value !== 'string') throw new Error('Training start missing');
  let timestamp = Date.parse(value);
  if (!/(Z|[+-]\d\d:\d\d)$/i.test(value)) {
    if (number(offset) === null)
      throw new Error('Training timezone offset missing');
    timestamp = Date.parse(value + 'Z') - Number(offset) * 60000;
  }
  if (!Number.isFinite(timestamp))
    throw new Error('Invalid training timestamp');
  return new Date(timestamp).toISOString();
}
function sportName(id: unknown, sports: PolarStore['sports']) {
  return (
    string(sports.find((s) => String(object(s.id).id) === String(id))?.name) ??
    String(id ?? 'Unavailable')
  );
}
function sport(name: string): CanonicalActivity['sport'] {
  const s = name.toUpperCase().replace(/[ -]/g, '_');
  if (/^(TRAIL_RUNNING|TRAIL_RUN)$/.test(s)) return 'trail_run';
  if (/^(RUNNING|ROAD_RUNNING|TREADMILL_RUNNING)$/.test(s)) return 'run';
  if (/^(STRENGTH_TRAINING|WEIGHT_TRAINING)$/.test(s)) return 'strength';
  if (/^(CYCLING|ROAD_CYCLING|INDOOR_CYCLING|MOUNTAIN_BIKING)$/.test(s))
    return 'cycling';
  if (/SWIMMING/.test(s)) return 'swimming';
  if (s === 'WALKING') return 'walking';
  if (s === 'HIKING') return 'hiking';
  return 'other';
}
export function normalizePolarTraining(
  raw: unknown,
  binding: string,
  sports: PolarStore['sports'],
  now = new Date().toISOString(),
): { activity: CanonicalActivity; source: ExternalActivitySource } {
  const r = z.record(z.string(), z.unknown()).parse(raw),
    externalId = z.string().min(1).parse(object(r.identifier).id),
    key = `polar:${binding}:${externalId}`,
    id = `activity-${fingerprint(key).slice(0, 32)}`,
    exercises = array(r.exercises),
    first = exercises.length === 1 ? exercises[0] : {},
    hrStats = array(object(first.statistics).statistics).find(
      (s) => s.type === 'STATISTICS_TYPE_HEART_RATE',
    ),
    providerType = sportName(
      object(r.sport).id ?? object(first.sport).id,
      sports,
    ),
    values = {
      title:
        string(r.name)?.trim() ||
        polarFallbackTitle(sport(providerType), String(r.startTime)),
      sport: sport(providerType),
      startedAt: polarTimestamp(r.startTime, r.timezoneOffsetMinutes),
      localStart: string(r.startTime),
      timeZone:
        number(r.timezoneOffsetMinutes) === null
          ? null
          : `UTC offset ${r.timezoneOffsetMinutes} min`,
      elapsedSeconds:
        number(r.durationMillis) === null
          ? null
          : Number(r.durationMillis) / 1000,
      movingSeconds: null,
      distanceM: number(r.distanceMeters),
      elevationM: number(first.ascentMeters),
      averageHr: number(r.hrAvg) ?? number(hrStats?.avg),
      maxHr: number(r.hrMax) ?? number(hrStats?.max),
      averageSpeed: null,
      device: string(object(r.product).modelName) ?? string(r.deviceId),
    };
  const available = Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(([k]) => k),
    missing = ['averageHr', 'device'].filter((k) => !available.includes(k));
  return {
    activity: {
      ...values,
      id,
      status: 'confirmed',
      quality: {
        available,
        missing,
        confidence: missing.length ? 'limited' : 'recorded',
      },
      fieldSources: Object.fromEntries(available.map((k) => [k, key])),
      sourceKeys: [key],
      gymWorkoutId: null,
      plannedSessionId: null,
      createdAt: now,
      updatedAt: now,
    },
    source: {
      key,
      externalId,
      athleteId: null,
      provider: 'polar',
      providerType,
      activityId: id,
      syncedAt: now,
      device: values.device,
      fingerprint: fingerprint(r),
      raw: r,
      previous: [],
      deleted: false,
    },
  };
}
export function trainingRows(raw: unknown) {
  return z
    .array(z.record(z.string(), z.unknown()))
    .parse(object(raw).trainingSessions ?? []);
}
export function familyRows(raw: unknown, family: PolarFamily) {
  const r = object(raw);
  switch (family) {
    case 'training':
      return trainingRows(raw);
    case 'sleep':
      return z
        .array(z.record(z.string(), z.unknown()))
        .parse(r.nightSleeps ?? []);
    case 'nightly':
      return z
        .array(z.record(z.string(), z.unknown()))
        .parse(object(r.nightlyRechargeResults).nightlyRechargeResults ?? []);
    case 'continuous':
      return z
        .array(z.record(z.string(), z.unknown()))
        .parse(object(r.continuousSamples).heartRateSamplesPerDay ?? []);
    case 'ppi':
      return z
        .array(z.record(z.string(), z.unknown()))
        .parse(r.dailyPpiSamples ?? []);
  }
}
export function rowDate(row: Record<string, unknown>, family: PolarFamily) {
  return date(
    family === 'training'
      ? string(row.startTime)?.slice(0, 10)
      : family === 'sleep'
        ? row.sleepDate
        : family === 'nightly'
          ? row.sleepResultDate
          : row.date,
  );
}
export function storePolarRows(
  store: PolarStore,
  family: Exclude<PolarFamily, 'training'>,
  rows: Record<string, unknown>[],
  now = new Date().toISOString(),
) {
  for (const r of rows) {
    const d = rowDate(r, family),
      base = {
        date: d,
        source: 'polar' as const,
        syncedAt: now,
        raw: r,
        previous: [] as Record<string, unknown>[],
        device: null as string | null,
        sensorQuality: 'unknown' as const,
      };
    if (family === 'sleep') {
      const evaluation = object(r.sleepEvaluation),
        h = object(object(r.sleepResult).hypnogram),
        analysis = object(evaluation.analysis),
        interruptions = object(evaluation.interruptions),
        asleep = durationSeconds(evaluation.asleepDuration);
      upsert(
        store.sleep,
        {
          ...base,
          device: string(object(h.deviceReference).uuid),
          start: string(h.sleepStart),
          end: string(h.sleepEnd),
          asleepSeconds: asleep,
          spanSeconds: durationSeconds(evaluation.sleepSpan),
          continuity: number(analysis.continuityIndex),
          efficiencyPercent: number(analysis.efficiencyPercent),
          interruptions: number(interruptions.totalCount),
          awakeSeconds: durationSeconds(interruptions.totalDuration),
          phaseSeconds: Object.fromEntries(
            Object.entries(object(evaluation.phaseDurations)).map(([k, v]) => [
              k,
              durationSeconds(v),
            ]),
          ),
          vendorSleepScore: number(object(r.sleepScore).sleepScore),
          userModified: !!r.originalSleepResult,
          complete:
            asleep !== null &&
            typeof h.sleepStart === 'string' &&
            typeof h.sleepEnd === 'string' &&
            h.batteryRanOut !== true,
        },
        false,
      );
    } else if (family === 'nightly')
      upsert(store.nightly, {
        ...base,
        rmssdMs: number(r.meanNightlyRecoveryRmssd),
        rriMs: number(r.meanNightlyRecoveryRri),
        respirationIntervalMs: number(r.meanNightlyRecoveryRespirationInterval),
        vendor: Object.fromEntries(
          Object.entries(r).filter(([k]) =>
            /Baseline|^(ansStatus|ansRate|recoveryIndicator|recoveryIndicatorSubLevel)$/.test(
              k,
            ),
          ),
        ),
      });
    else if (family === 'continuous')
      upsert(store.continuous, {
        ...base,
        device: string(object(r.deviceRef).deviceId),
        samples: array(r.samples).map((s) => ({
          offsetMillis: number(s.offsetMillis),
          timestamp: null,
          heartRate: number(s.heartRate),
          triggerType: s.triggerType ?? null,
        })),
      });
    else {
      for (const device of array(r.ppiSamplesPerDevice))
        upsert(store.ppi, {
          ...base,
          device: string(object(device.recordingDevice).uuid),
          samples: array(device.ppiSamples).map((s) => ({
            offsetMillis: number(s.offsetMillis),
            timestamp: null,
            intervalMs: number(s.ppInterval),
            errorEstimateMs: number(s.errorEstimateMillis),
            skinContact: s.skinContact ?? null,
            movement: s.movement ?? null,
            offline: s.offline ?? null,
          })),
          triggers: array(device.recordingTriggerTypeChanges),
        });
    }
  }
}
function upsert<
  T extends {
    date: string;
    device: string | null;
    raw: Record<string, unknown>;
    previous: Record<string, unknown>[];
    validityOverride?:
      import('../domain/observation-quality').ValidityOverride | null;
  },
>(list: T[], value: T, byDevice = true) {
  const index = list.findIndex(
    (v) => v.date === value.date && (!byDevice || v.device === value.device),
  );
  if (index < 0) list.push(value);
  else {
    value.previous = list[index].previous;
    value.validityOverride = list[index].validityOverride;
    if (fingerprint(list[index].raw) !== fingerprint(value.raw))
      value.previous = [...value.previous, list[index].raw];
    list[index] = value;
  }
}
export function normalizePolarFeatures(
  raw: Record<string, unknown>,
  sourceKey: string,
): { polar: PolarFeatures; laps: ActivityLap[] } {
  const laps: ActivityLap[] = [];
  const exercises = array(raw.exercises).map((e) => {
    const lapGroup = object(e.laps);
    for (const kind of ['laps', 'autoLaps'] as const) {
      const list = lapGroup[kind];
      for (const l of array(list)) {
        const stats = array(object(l.statistics).statistics).find(
          (s) => s.type === 'STATISTICS_TYPE_HEART_RATE',
        );
        laps.push({
          kind: kind === 'laps' ? 'manual' : 'automatic',
          exerciseId: string(object(e.identifier).id),
          index: laps.length,
          startedAt: null,
          elapsedSeconds:
            number(l.durationMillis) === null
              ? null
              : Number(l.durationMillis) / 1000,
          movingSeconds: null,
          distanceM: number(l.distanceMeters),
          averageSpeed: null,
          averageHr: number(stats?.avg),
          maxHr: number(stats?.max),
          sourceKey,
          raw: { ...l, kind, exerciseId: object(e.identifier).id ?? null },
        });
      }
    }
    return {
      id: string(object(e.identifier).id),
      runningIndex: number(e.runningIndex),
      trainingLoad: object(e.trainingLoadReport),
      samples: array(object(e.samples).samples).map((s) => ({
        type: string(s.type) ?? 'UNSPECIFIED',
        unit: s.type === 'HEART_RATE' ? 'bpm' : 'provider_unspecified',
        intervalMillis: number(s.intervalMillis),
        values: Array.isArray(s.values) ? s.values.map((v) => number(v)) : [],
      })),
      zones: array(e.zones),
      pauses: array(e.pauseTimes),
      routes: object(e.routes),
      statistics: object(e.statistics),
    };
  });
  return { polar: { exercises, raw, sensorQuality: 'unknown' }, laps };
}
