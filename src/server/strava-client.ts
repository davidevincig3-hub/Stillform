import 'server-only';
import { z } from 'zod';
import type {
  CanonicalActivity,
  ExternalActivitySource,
  NormalizedStream,
  ActivityLap,
  Sport,
} from '../domain/activity';
import { fingerprint } from './integration-security';
import { STRAVA_ENDPOINTS, type IntegrationConfig } from './integration-config';
export const REQUIRED_SCOPES = ['activity:read', 'activity:read_all'];
export function scopesFrom(value: string) {
  return value.split(/[\s,]+/).filter(Boolean);
}
export function requireScopes(scopes: string[]) {
  if (!scopes.includes('activity:read_all'))
    throw new StravaError(
      'Required activity:read_all scope was not granted',
      403,
    );
}
export const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
  scope: z.string().optional(),
  athlete: z.object({ id: z.number().int().positive() }).optional(),
});
export interface Connection {
  athleteId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  connectedAt: string;
}
export class StravaError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAt = 0,
  ) {
    super(message);
  }
}
export function ratePause(headers: Headers, now = Date.now()) {
  let pause = 0;
  for (const prefix of ['X-RateLimit', 'X-ReadRateLimit']) {
    const limits = (headers.get(`${prefix}-Limit`) || '')
        .split(',')
        .map(Number),
      usage = (headers.get(`${prefix}-Usage`) || '').split(',').map(Number);
    if (limits.length !== 2 || usage.length !== 2) continue;
    if (limits[0] > 0 && limits[0] - usage[0] <= 2)
      pause = Math.max(pause, (Math.floor(now / 900000) + 1) * 900000 + 1000);
    if (limits[1] > 0 && limits[1] - usage[1] <= 2) {
      const d = new Date(now);
      d.setUTCHours(24, 0, 1, 0);
      pause = Math.max(pause, d.getTime());
    }
  }
  const retry = headers.get('Retry-After');
  if (retry) {
    const seconds = Number(retry);
    pause = Math.max(
      pause,
      Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retry) || 0,
    );
  }
  return pause;
}
export class StravaClient {
  pauseUntil = 0;
  constructor(
    private config: IntegrationConfig,
    private http: typeof fetch = fetch,
  ) {}
  private async request(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.http(url, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new StravaError(
        'Strava request timed out or could not be reached',
        503,
        Date.now() + 30000,
      );
    }
    this.pauseUntil = Math.max(this.pauseUntil, ratePause(response.headers));
    if (!response.ok)
      throw new StravaError(
        response.status === 429
          ? 'Strava rate limit reached'
          : response.status === 401
            ? 'Strava authorization expired or revoked'
            : 'Strava request failed',
        response.status,
        response.status === 429
          ? Math.max(this.pauseUntil, Date.now() + 60000)
          : response.status >= 500
            ? Date.now() + 30000
            : 0,
      );
    return response;
  }
  async exchange(code: string) {
    const r = await this.request(STRAVA_ENDPOINTS.token, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    return tokenSchema.parse(await r.json());
  }
  async refresh(connection: Connection) {
    const r = await this.request(STRAVA_ENDPOINTS.token, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      }),
    }).catch((error) => {
      if (error instanceof StravaError && error.status === 400)
        throw new StravaError(
          'Strava authorization could not be refreshed; reconnect',
          401,
        );
      throw error;
    });
    const t = tokenSchema.parse(await r.json());
    const scopes = t.scope ? scopesFrom(t.scope) : connection.scopes;
    requireScopes(scopes);
    return {
      ...connection,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_at,
      scopes,
    };
  }
  async revoke(connection: Connection) {
    await this.request(STRAVA_ENDPOINTS.revoke, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        token: connection.refreshToken,
        token_type_hint: 'refresh_token',
      }),
    });
  }
  async get(path: string, connection: Connection) {
    if (Date.now() < this.pauseUntil)
      throw new StravaError(
        'Strava rate budget is paused',
        429,
        this.pauseUntil,
      );
    const r = await this.request(`${this.config.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });
    return r.status === 204 ? null : ((await r.json()) as unknown);
  }
  async activities(
    connection: Connection,
    page: number,
    before: number,
    after = 0,
  ) {
    return z
      .array(z.record(z.string(), z.unknown()))
      .parse(
        await this.get(
          `/athlete/activities?per_page=50&page=${page}&before=${before}${after ? `&after=${after}` : ''}`,
          connection,
        ),
      );
  }
}
const activityInput = z
  .object({
    id: z.number().int().positive(),
    athlete: z
      .object({ id: z.number().int().positive() })
      .passthrough()
      .optional(),
    name: z.string(),
    start_date: z.iso.datetime(),
    start_date_local: z.string().nullish(),
    timezone: z.string().nullish(),
    sport_type: z.string().nullish(),
    type: z.string().nullish(),
    elapsed_time: z.number().nonnegative(),
    moving_time: z.number().nonnegative().nullish(),
    distance: z.number().nonnegative().nullish(),
    total_elevation_gain: z.number().nonnegative().nullish(),
    average_heartrate: z.number().nonnegative().nullish(),
    max_heartrate: z.number().nonnegative().nullish(),
    average_speed: z.number().nonnegative().nullish(),
    device_name: z.string().nullable().optional(),
  })
  .passthrough();
export function normalizeSport(type: string): Sport {
  if (type === 'TrailRun') return 'trail_run';
  if (['Run', 'VirtualRun'].includes(type)) return 'run';
  if (/Ride$/.test(type) || type === 'Cycling') return 'cycling';
  if (type === 'Swim') return 'swimming';
  if (type === 'Walk') return 'walking';
  if (type === 'Hike') return 'hiking';
  if (['WeightTraining', 'Workout', 'Crossfit'].includes(type))
    return type === 'WeightTraining' ? 'strength' : 'other';
  return 'other';
}
export function normalizeStrava(
  raw: unknown,
  athleteId: string,
  now = new Date().toISOString(),
): { activity: CanonicalActivity; source: ExternalActivitySource } {
  const r = activityInput.parse(raw),
    key = `strava:${athleteId}:${r.id}`,
    id = `activity-${fingerprint(key).slice(0, 32)}`;
  if (r.athlete && String(r.athlete.id) !== athleteId)
    throw new StravaError('Activity belongs to a different athlete', 403);
  const values = {
    title: r.name,
    sport: normalizeSport(r.sport_type || r.type || 'Unknown'),
    startedAt: r.start_date,
    elapsedSeconds: r.elapsed_time,
    movingSeconds: r.moving_time ?? null,
    distanceM: r.distance ?? null,
    elevationM: r.total_elevation_gain ?? null,
    averageHr: r.average_heartrate ?? null,
    maxHr: r.max_heartrate ?? null,
    averageSpeed: r.average_speed ?? null,
    device: r.device_name ?? null,
    timeZone: r.timezone ?? null,
    localStart: r.start_date_local ?? null,
  };
  const available = Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(([k]) => k),
    missing = ['averageHr', 'device'].filter((k) => !available.includes(k));
  return {
    activity: {
      id,
      ...values,
      status: 'confirmed',
      quality: { available, missing, confidence: 'recorded' },
      fieldSources: Object.fromEntries(available.map((k) => [k, key])),
      sourceKeys: [key],
      gymWorkoutId: null,
      plannedSessionId: null,
      createdAt: now,
      updatedAt: now,
    },
    source: {
      key,
      provider: 'strava',
      externalId: String(r.id),
      athleteId,
      activityId: id,
      providerType: r.sport_type || r.type || 'Unknown',
      syncedAt: now,
      device: r.device_name ?? null,
      fingerprint: fingerprint(r),
      deleted: false,
      raw: r,
      previous: [],
    },
  };
}
const streamKinds = [
  'time',
  'distance',
  'latlng',
  'altitude',
  'velocity_smooth',
  'heartrate',
  'cadence',
  'moving',
  'grade_smooth',
] as const;
export function normalizeStreams(raw: unknown): {
  streams: NormalizedStream[];
  warnings: string[];
} {
  const records = Array.isArray(raw)
    ? raw
    : Object.entries(z.record(z.string(), z.unknown()).parse(raw)).map(
        ([type, v]) => ({
          ...z.record(z.string(), z.unknown()).parse(v),
          type,
        }),
      );
  const streams: NormalizedStream[] = [],
    warnings: string[] = [];
  for (const item of records) {
    const r = z
      .object({
        type: z.string(),
        data: z.array(z.unknown()),
        series_type: z.string().nullish(),
        resolution: z.string().optional(),
        original_size: z.number().int().nonnegative().optional(),
      })
      .parse(item);
    const kind = streamKinds.find((k) => k === r.type);
    if (!kind) {
      warnings.push(
        'Unsupported stream kind omitted by the current normalizer',
      );
      continue;
    }
    const schema =
      kind === 'latlng'
        ? z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])
        : kind === 'moving'
          ? z.boolean()
          : z.number().finite();
    const parsed = z.array(schema).safeParse(r.data);
    if (!parsed.success) {
      warnings.push(`Invalid ${kind} stream omitted; other streams retained.`);
      continue;
    }
    streams.push({
      kind,
      data: parsed.data,
      seriesType: r.series_type ?? 'unknown',
      resolution: r.resolution ?? 'unknown',
      originalSize: r.original_size ?? null,
    });
  }
  return { streams, warnings };
}
export function normalizeLaps(raw: unknown, sourceKey: string): ActivityLap[] {
  return z
    .array(z.record(z.string(), z.unknown()))
    .parse(raw)
    .map((r, index) => {
      const number = (k: string) =>
        typeof r[k] === 'number' && Number.isFinite(r[k])
          ? (r[k] as number)
          : null;
      return {
        index,
        startedAt: typeof r.start_date === 'string' ? r.start_date : null,
        elapsedSeconds: number('elapsed_time'),
        movingSeconds: number('moving_time'),
        distanceM: number('distance'),
        averageSpeed: number('average_speed'),
        averageHr: number('average_heartrate'),
        maxHr: number('max_heartrate'),
        sourceKey,
        raw: r,
      };
    });
}
