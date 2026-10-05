import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MemoryRepository,
  json,
  activityRaw,
  connection,
} from '../helpers/integrations';
import {
  training,
  sports,
  sleep,
  nightly,
  continuous,
  ppi,
} from '../helpers/polar';
import { polarConfig, polarConnection } from '../helpers/polar-server';
import {
  PolarClient,
  POLAR_ENDPOINTS,
  PolarError,
} from '../../src/server/polar-client';
import {
  polarAuthorized,
  polarSyncStep,
  enrichPolar,
} from '../../src/server/polar-service';
import {
  normalizePolarTraining,
  normalizePolarFeatures,
  storePolarRows,
  polarTimestamp,
} from '../../src/server/polar-normalize';
import {
  emptyPolarStore,
  addDays,
  windowDays,
  polarStoreSchema,
} from '../../src/domain/polar';
import {
  emptyRegistry,
  canonicalActivitySchema,
} from '../../src/domain/activity';
import {
  ingestActivity,
  registerGymLinks,
  resolveActivityMatch,
} from '../../src/integrations/activity-matching';
import { normalizeStrava } from '../../src/server/strava-client';
import { missingConfiguration } from '../../src/server/integration-config';
import { SupabaseIntegrationRepository } from '../../src/server/integration-repository';
import {
  windowSummary,
  baselineMaturity,
  recoverySeries,
  type RecoveryData,
} from '../../src/analytics/polar-recovery';
afterEach(() => {
  vi.useRealTimers();
});
function repo() {
  const r = new MemoryRepository();
  r.polarCredential = structuredClone(polarConnection);
  r.polarState.sports = sports;
  return r;
}
function clock() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
}
describe('Polar OAuth, scopes and secure storage', () => {
  it('uses current v4 endpoints, Basic token authentication, exact redirect and actual granted scopes', async () => {
    const http = vi.fn(async () =>
      json({
        access_token: 'synthetic-new-access',
        refresh_token: 'synthetic-new-refresh',
        expires_in: 43199,
        token_type: 'bearer',
        scope: 'sleep:read',
      }),
    );
    const c = await new PolarClient(polarConfig, http).exchange(
      'synthetic-code',
      'owner',
    );
    expect(c.scopes).toEqual(['sleep:read']);
    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(POLAR_ENDPOINTS.token);
    expect(new Headers(init.headers).get('Authorization')).toMatch(/^Basic /);
    expect(String(init.body)).toContain(
      'redirect_uri=http%3A%2F%2Flocalhost%3A3100%2Fapi%2Fpolar%2Fcallback',
    );
    expect(c.athleteId).toBe('owner');
  });
  it('refreshes expired access, persists rotated refresh before API use and leaves Strava alone', async () => {
    clock();
    const r = repo();
    r.polarCredential!.expiresAt = 1;
    const http = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === POLAR_ENDPOINTS.token)
        return json({
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_in: 43200,
          token_type: 'bearer',
        });
      expect(r.polarCredential!.refreshToken).toBe('rotated-refresh');
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer rotated-access',
      );
      return json({ trainingSessions: [] });
    });
    await polarAuthorized('owner', r, new PolarClient(polarConfig, http), (c) =>
      new PolarClient(polarConfig, http).window(
        c,
        'training',
        '2026-10-01',
        '2026-10-02',
      ),
    );
    expect(r.credential).toEqual(connection);
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('retries one 401 and retains credentials on scope denial or revoked refresh for explicit recovery', async () => {
    const r = repo();
    let requests = 0;
    const http = vi.fn(async (url: RequestInfo | URL) =>
      String(url) === POLAR_ENDPOINTS.token
        ? json({
            access_token: 'rotated',
            refresh_token: 'rotated-refresh',
            expires_in: 43200,
            token_type: 'bearer',
          })
        : ++requests === 1
          ? json({}, 401)
          : json({}, 403),
    );
    await expect(
      polarAuthorized('owner', r, new PolarClient(polarConfig, http), (c) =>
        new PolarClient(polarConfig, http).get(c, '/sleeps'),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(r.polarCredential).not.toBeNull();
    r.polarCredential!.expiresAt = 1;
    await expect(
      polarAuthorized(
        'owner',
        r,
        new PolarClient(polarConfig, async () => json({}, 400)),
        async () => null,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(r.polarCredential).not.toBeNull();
    expect(r.credential).not.toBeNull();
  });
  it('Polar config is independent of dormant Strava and prefers opaque Supabase secret without Bearer', async () => {
    const c = {
      ...polarConfig,
      clientId: '',
      clientSecret: '',
      serviceKey: 'deprecated',
    };
    expect(missingConfiguration(c, 'polar')).toEqual([]);
    expect(missingConfiguration(c)).toContain('STRAVA_CLIENT_ID');
    const http = vi.fn(async () => json([]));
    await new SupabaseIntegrationRepository(c, http).account('owner', 'polar');
    const init = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init[1].headers).get('apikey')).toBe(
      'sb_secret_synthetic',
    );
    expect(new Headers(init[1].headers).has('Authorization')).toBe(false);
  });
});
describe('bounded resumable sparse backfill', () => {
  it.each(Object.entries(windowDays))(
    'enforces %s-specific bounded date windows',
    async (f, max) => {
      const client = new PolarClient(polarConfig, async () => json({}));
      await expect(
        client.window(
          polarConnection,
          f as keyof typeof windowDays,
          '2026-01-01',
          addDays('2026-01-01', max + 1),
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('chunks 180 days into two 90-day training requests with idempotency and raw revisions', async () => {
    clock();
    const r = repo(),
      http = vi.fn(async (url: RequestInfo | URL) =>
        json({
          trainingSessions:
            new URL(String(url)).searchParams.get('from') ===
            '2026-04-05T00:00:00'
              ? []
              : [training()],
        }),
      ),
      client = new PolarClient(polarConfig, http);
    await polarSyncStep('owner', r, client, {
      families: ['training'],
      from: '2026-04-05',
      to: '2026-10-02',
    });
    expect(r.polarState.jobs.training?.done).toBe(false);
    expect(r.polarState.jobs.training?.next).toBe('2026-07-04');
    vi.advanceTimersByTime(1200);
    await polarSyncStep('owner', r, client, { families: ['training'] });
    expect(r.polarState.jobs.training?.done).toBe(true);
    expect(r.state.activities).toHaveLength(1);
    expect(r.state.sources[0].provider).toBe('polar');
    canonicalActivitySchema.parse(r.state.activities[0]);
    vi.advanceTimersByTime(1200);
    await polarSyncStep('owner', r, client, {
      families: ['training'],
      from: '2026-10-01',
      to: '2026-10-02',
      restart: true,
    });
    expect(r.state.activities).toHaveLength(1);
  });
  it('empty history is a successful real-data result, denied scope marks just that family', async () => {
    clock();
    const r = repo();
    r.polarCredential!.scopes = ['training_sessions:read'];
    await polarSyncStep(
      'owner',
      r,
      new PolarClient(polarConfig, async () => json({ trainingSessions: [] })),
      { families: ['training', 'sleep'], from: '2026-10-01', to: '2026-10-02' },
    );
    expect(r.polarState.realMode).toBe(true);
    expect(r.polarState.jobs.training).toMatchObject({
      done: true,
      errors: [],
      oldest: null,
    });
    expect(r.polarState.jobs.sleep).toMatchObject({ unavailable: true });
    expect(r.polarState.sleep).toEqual([]);
  });
  it('discovers only available sleep dates then hydrates one day; never backfills sample nights', async () => {
    clock();
    const r = repo();
    const http = vi.fn(async (url: RequestInfo | URL) =>
        json({
          nightSleeps: String(url).includes('features=')
            ? [sleep]
            : [{ sleepDate: sleep.sleepDate }],
        }),
      ),
      client = new PolarClient(polarConfig, http);
    await polarSyncStep('owner', r, client, {
      families: ['sleep'],
      from: '2026-09-20',
      to: '2026-10-02',
    });
    expect(r.polarState.sleep).toHaveLength(0);
    expect(r.polarState.jobs.sleep?.pending).toEqual(['2026-10-01']);
    vi.advanceTimersByTime(1200);
    await polarSyncStep('owner', r, client, { families: ['sleep'] });
    expect(r.polarState.sleep).toHaveLength(1);
    expect(String(http.mock.calls[1][0])).toContain(
      'from=2026-10-01&to=2026-10-02&features=sleep-result',
    );
    expect(r.polarState.jobs.sleep?.done).toBe(true);
  });
  it('persists 429 retry time and checkpoint, blocks requests until retry, resumes same window', async () => {
    clock();
    const r = repo(),
      http = vi.fn(async () => json({}, 429, { 'Retry-After': '60' })),
      client = new PolarClient(polarConfig, http);
    await expect(
      polarSyncStep('owner', r, client, {
        families: ['training'],
        from: '2026-10-01',
        to: '2026-10-02',
      }),
    ).rejects.toBeInstanceOf(PolarError);
    expect(r.polarState.jobs.training?.next).toBe('2026-10-01');
    expect(r.polarState.blockedUntil).toBe(Date.now() + 60000);
    await expect(
      polarSyncStep('owner', r, client, { families: ['training'] }),
    ).rejects.toMatchObject({ status: 429 });
    expect(http).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61000);
    await polarSyncStep(
      'owner',
      r,
      new PolarClient(polarConfig, async () => json({ trainingSessions: [] })),
      { families: ['training'] },
    );
    expect(r.polarState.jobs.training?.done).toBe(true);
  });
});
describe('canonical identity and source matching', () => {
  it('re-sync after sport catalog hydration resolves unknown IDs without duplicate activity or raw revision', () => {
    const state = emptyRegistry(),
      unknown = normalizePolarTraining(training(), 'owner', []);
    ingestActivity(state, unknown.activity, unknown.source);
    const known = normalizePolarTraining(training(), 'owner', sports);
    ingestActivity(state, known.activity, known.source);
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].sport).toBe('run');
    expect(state.sources[0].previous).toHaveLength(0);
  });
  it('normalizes timezone once and accepts missing HR, GPS and unknown sport', () => {
    const n = normalizePolarTraining(training(), 'owner', sports);
    expect(n.activity.startedAt).toBe('2026-10-01T08:00:00.000Z');
    expect(n.activity.sport).toBe('run');
    expect(n.activity.averageHr).toBeNull();
    expect(n.source.athleteId).toBeNull();
    expect(polarTimestamp('2026-10-01T08:00:00Z', 120)).toBe(
      n.activity.startedAt,
    );
    expect(() => polarTimestamp('2026-10-01T08:00:00', null)).toThrow();
    expect(normalizePolarTraining(training(), 'owner', []).activity.sport).toBe(
      'other',
    );
  });
  it('links Polar strength physiology to Gym without creating sets or changing Gym authority', () => {
    const state = emptyRegistry();
    registerGymLinks(
      state,
      [
        {
          id: 'gym-real',
          title: 'Local Gym',
          startedAt: '2026-10-01T08:00:00Z',
          endedAt: '2026-10-01T09:00:00Z',
          durationMinutes: 60,
          source: 'local_logger',
        },
      ],
      '2026-10-01T09:00:00Z',
    );
    const n = normalizePolarTraining(
      { ...training('strength', true), hrAvg: 120 },
      'owner',
      sports,
    );
    expect(ingestActivity(state, n.activity, n.source)).toBe('linked');
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].gymWorkoutId).toBe('gym-real');
    expect(state.activities[0].title).toBe('Local Gym');
    expect(state.activities[0].averageHr).toBe(120);
  });
  it('future Strava copies link once; Polar HR is selected with explicit field provenance', () => {
    const state = emptyRegistry(),
      s = normalizeStrava({ ...activityRaw(), average_heartrate: 140 }, '7'),
      p = normalizePolarTraining(
        { ...training(), hrAvg: 145 },
        'owner',
        sports,
      );
    ingestActivity(state, s.activity, s.source);
    expect(ingestActivity(state, p.activity, p.source)).toBe('linked');
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].averageHr).toBe(145);
    expect(state.activities[0].fieldSources.averageHr).toBe(p.source.key);
  });
  it('ambiguous overlaps enter manual review and updated Polar raw revisions remain reconstructable', () => {
    const state = emptyRegistry();
    for (const id of [1, 2]) {
      const s = normalizeStrava(activityRaw(id), '7');
      ingestActivity(state, s.activity, s.source);
      if (id === 2)
        resolveActivityMatch(state, s.source.key, null, '2026-10-01T09:00:00Z');
    }
    const p = normalizePolarTraining(training(), 'owner', sports);
    expect(ingestActivity(state, p.activity, p.source)).toBe('review');
    expect(state.reviews.some((r) => r.sourceKey === p.source.key)).toBe(true);
    const updated = normalizePolarTraining(
      { ...training(), hrAvg: 150 },
      'owner',
      sports,
    );
    ingestActivity(state, updated.activity, updated.source);
    expect(
      state.sources.find((s) => s.key === p.source.key)?.previous,
    ).toHaveLength(1);
  });
});
describe('rich training and recovery normalization', () => {
  it('preserves laps, zones, route, pause, Running Index and training load with units/context', () => {
    const r = {
      ...training(),
      exercises: [
        {
          identifier: { id: 'exercise-1' },
          runningIndex: 55,
          trainingLoadReport: { cardioLoad: 60 },
          samples: {
            samples: [
              { type: 'HEART_RATE', intervalMillis: 1000, values: [120, 130] },
              { type: 'SPEED', intervalMillis: 1000, values: [8, 9] },
            ],
          },
          laps: {
            laps: [
              {
                durationMillis: 300000,
                distanceMeters: 1000,
                statistics: {
                  statistics: [
                    { type: 'STATISTICS_TYPE_HEART_RATE', avg: 140, max: 160 },
                  ],
                },
              },
            ],
          },
          zones: [
            {
              type: 'HEART_RATE',
              zones: [{ lowerLimit: 100, higherLimit: 150, inZone: 200000 }],
            },
          ],
          pauseTimes: [{ startTime: 100, endTime: 200 }],
          routes: {
            route: {
              wayPoints: [{ latitude: 40, longitude: 10, elapsedMillis: 1000 }],
            },
          },
          statistics: { statistics: [] },
        },
      ],
    };
    const f = normalizePolarFeatures(r, 'key');
    expect(f.laps[0]).toMatchObject({
      elapsedSeconds: 300,
      averageHr: 140,
      maxHr: 160,
    });
    expect(f.polar.exercises[0]).toMatchObject({
      runningIndex: 55,
      trainingLoad: { cardioLoad: 60 },
      samples: [
        { unit: 'bpm', values: [120, 130] },
        { unit: 'provider_unspecified' },
      ],
    });
    expect(f.polar.exercises[0].zones).toHaveLength(1);
    expect(f.polar.exercises[0].pauses).toHaveLength(1);
  });
  it('enrichment uses one feature-day request, saves large arrays server-side and matches session ID', async () => {
    const r = repo(),
      n = normalizePolarTraining(training(), 'owner', sports);
    ingestActivity(r.state, n.activity, n.source);
    const http = vi.fn<typeof fetch>(async () =>
      json({
        trainingSessions: [
          training('different'),
          { ...training(), exercises: [{ runningIndex: 51 }] },
        ],
      }),
    );
    await enrichPolar(
      'owner',
      n.source.key,
      r,
      new PolarClient(polarConfig, http),
    );
    expect(r.richData[n.source.key].polar?.exercises[0].runningIndex).toBe(51);
    expect(http).toHaveBeenCalledTimes(1);
    expect(String(http.mock.calls[0][0])).toContain(
      'features=samples&features=training-load-report',
    );
  });
  it('normalizes sleep and edited/incomplete source quality, nullable optional fields and raw revisions', () => {
    const s = emptyPolarStore();
    storePolarRows(s, 'sleep', [sleep]);
    expect(s.sleep[0]).toMatchObject({
      asleepSeconds: 27000,
      spanSeconds: 28800,
      vendorSleepScore: 80,
      complete: true,
      userModified: false,
    });
    storePolarRows(s, 'sleep', [
      {
        ...sleep,
        originalSleepResult: sleep.sleepResult,
        sleepResult: {
          hypnogram: { ...sleep.sleepResult.hypnogram, batteryRanOut: true },
        },
      },
    ]);
    expect(s.sleep).toHaveLength(1);
    expect(s.sleep[0]).toMatchObject({ complete: false, userModified: true });
    expect(s.sleep[0].previous).toHaveLength(1);
    storePolarRows(s, 'sleep', [{ sleepDate: '2026-10-02' }]);
    expect(s.sleep[1].asleepSeconds).toBeNull();
    polarStoreSchema.parse(s);
  });
  it('preserves vendor RMSSD/RRI without fabricating HRV from continuous BPM or poor PPI', () => {
    const s = emptyPolarStore();
    storePolarRows(s, 'nightly', [nightly]);
    storePolarRows(s, 'continuous', [continuous]);
    storePolarRows(s, 'ppi', [ppi]);
    expect(s.nightly[0]).toMatchObject({
      rmssdMs: 42,
      rriMs: 1000,
      respirationIntervalMs: 4000,
      vendor: { meanBaselineRmssd: 40 },
    });
    expect(s.continuous[0].samples[0]).toMatchObject({
      heartRate: 70,
      offsetMillis: 3600000,
      timestamp: null,
    });
    expect(s.ppi[0].samples[0]).toMatchObject({
      intervalMs: 900,
      errorEstimateMs: 10,
      skinContact: true,
      timestamp: null,
    });
    expect(s.ppi[0].triggers).toHaveLength(1);
    polarStoreSchema.parse(s);
  });
  it('counts only actual complete observations, leaves gaps and uses configurable unvalidated maturity', () => {
    const points = [
      {
        date: '2026-10-01',
        value: 42,
        source: 'polar' as const,
        complete: true,
      },
      {
        date: '2026-10-02',
        value: 45,
        source: 'polar' as const,
        complete: false,
      },
    ];
    const s = windowSummary(points, 7, '2026-10-04T12:00:00Z');
    expect(s).toMatchObject({
      count: 2,
      completeCount: 1,
      maturity: 'insufficient',
      referenceMean: null,
    });
    expect(s.points.filter((p) => p.value === null)).toHaveLength(5);
    expect(baselineMaturity(9)).toBe('preliminary');
    expect(
      baselineMaturity(9, { preliminary: 3, developing: 5, established: 8 }),
    ).toBe('established');
    const data = {
      realMode: true,
      connected: true,
      sleep: [],
      nightly: [],
      asOf: '2026-10-04T12:00:00Z',
      continuousDays: 0,
      ppiDays: 0,
    } satisfies RecoveryData;
    expect(recoverySeries(data).every((s) => s.points.length === 0)).toBe(true);
  });
});
