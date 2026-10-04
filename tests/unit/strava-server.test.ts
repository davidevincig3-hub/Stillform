import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  StravaClient,
  StravaError,
  ratePause,
  scopesFrom,
  requireScopes,
  REQUIRED_SCOPES,
} from '../../src/server/strava-client';
import {
  newOAuthState,
  validateOAuthState,
  seal,
  unseal,
} from '../../src/server/integration-security';
import {
  integrationConfig,
  missingConfiguration,
  STRAVA_ENDPOINTS,
} from '../../src/server/integration-config';
import {
  SupabaseIntegrationRepository,
  DevFileIntegrationRepository,
} from '../../src/server/integration-repository';
import {
  authorizedCall,
  syncPage,
  enrichActivity,
  queueWebhook,
  webhookChallenge,
  processWebhook,
  markSourceDeleted,
} from '../../src/server/strava-service';
import {
  config,
  connection,
  activityRaw,
  MemoryRepository,
  json,
} from '../helpers/integrations';
import {
  ingestActivity,
  registerGymLinks,
} from '../../src/integrations/activity-matching';
import { normalizeStrava } from '../../src/server/strava-client';
const owner = 'owner';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('OAuth and private credentials', () => {
  it('binds random expiring state to cookie/owner and rejects mutation/replay without cookie', () => {
    const s = newOAuthState(owner, config.encryptionKey, 1000),
      s2 = newOAuthState(owner, config.encryptionKey, 1000);
    expect(s.nonce).not.toBe(s2.nonce);
    expect(s.cookie).not.toContain(s.nonce);
    expect(
      validateOAuthState(s.nonce, s.cookie, owner, config.encryptionKey, 2000)
        .owner,
    ).toBe(owner);
    for (const args of [
      [s.nonce, s.cookie, 'another', 2000],
      ['wrong', s.cookie, owner, 2000],
      [s.nonce, s.cookie, owner, 601001],
      [s.nonce, '', owner, 2000],
    ] as const)
      expect(() =>
        validateOAuthState(
          args[0],
          args[1],
          args[2],
          config.encryptionKey,
          args[3],
        ),
      ).toThrow();
  });
  it('encrypts tokens with random authenticated envelopes and detects tampering', () => {
    const a = seal(connection, config.encryptionKey);
    expect(a).not.toContain(connection.refreshToken);
    expect(a).not.toEqual(seal(connection, config.encryptionKey));
    expect(unseal(a, config.encryptionKey)).toEqual(connection);
    expect(() => unseal(a, 'cd'.repeat(32))).toThrow();
    expect(() => seal(connection, '')).toThrow();
  });
  it('requires private-history scope and never requests write permission', () => {
    expect(scopesFrom('activity:read,activity:read_all')).toEqual(
      REQUIRED_SCOPES,
    );
    expect(scopesFrom('activity:read activity:read_all')).toEqual(
      REQUIRED_SCOPES,
    );
    expect(() => requireScopes(['activity:read'])).toThrow();
    expect(() => requireScopes(['activity:read_all'])).not.toThrow();
    expect(REQUIRED_SCOPES.some((s) => s.includes('write'))).toBe(false);
  });
  it('rotates refresh token and persists it before making the next API request', async () => {
    const repo = new MemoryRepository();
    repo.credential = { ...connection, expiresAt: 1 };
    const http = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url) === STRAVA_ENDPOINTS.token) {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return json({
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_at: 4102444800,
          scope: 'activity:read_all activity:read',
        });
      }
      expect(repo.credential?.refreshToken).toBe('rotated-refresh');
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer rotated-access',
      );
      return json([]);
    });
    const client = new StravaClient(config, http);
    await authorizedCall(owner, repo, client, (c) =>
      client.activities(c, 1, 123),
    );
    expect(repo.saves).toHaveLength(1);
  });
  it('retries one expired authorization and removes revoked connections', async () => {
    const repo = new MemoryRepository();
    const http = vi.fn<typeof fetch>(async (url) =>
      String(url) === STRAVA_ENDPOINTS.token ? json({}, 401) : json({}, 401),
    );
    const client = new StravaClient(config, http);
    await expect(
      authorizedCall(owner, repo, client, (c) => client.get('/athlete', c)),
    ).rejects.toBeInstanceOf(StravaError);
    expect(repo.credential).toBeNull();
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('uses current refresh-token revocation endpoint with client authentication', async () => {
    const http = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe('https://www.strava.com/oauth/revoke');
      expect(new Headers(init?.headers).get('Authorization')).toMatch(
        /^Basic /,
      );
      expect(String(init?.body)).toContain('token_type_hint=refresh_token');
      return new Response(null, { status: 200 });
    });
    await new StravaClient(config, http).revoke(connection);
  });
  it('requires explicit development storage and rejects unsafe configuration', () => {
    expect(missingConfiguration(integrationConfig({}))).toContain(
      'STRAVA_CLIENT_SECRET',
    );
    expect(() =>
      integrationConfig({
        INTEGRATION_STORAGE: 'dev-file',
        NODE_ENV: 'production',
      }),
    ).toThrow();
    expect(() =>
      integrationConfig({ APP_ORIGIN: 'http://example.com' }),
    ).toThrow();
    expect(() =>
      integrationConfig({ STRAVA_API_BASE_URL: 'https://attacker.invalid' }),
    ).toThrow();
    expect(() =>
      integrationConfig({ SUPABASE_URL: 'http://example.com' }),
    ).toThrow();
    expect(
      () => new DevFileIntegrationRepository({ ...config, mode: 'dev-file' }),
    ).toThrow();
    expect(
      integrationConfig({ STRAVA_API_BASE_URL: 'https://api-v3.strava.com' })
        .apiBase,
    ).toBe('https://api-v3.strava.com');
  });
  it('persists encrypted credentials only in server repository and uses CAS RPC', async () => {
    const http = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('integration_accounts?on_conflict')) {
        const body = JSON.parse(String(init?.body));
        expect(body.credential).not.toContain('synthetic-refresh');
        expect(unseal(body.credential, config.encryptionKey)).toEqual(
          connection,
        );
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer synthetic-service',
        );
        return new Response(null, { status: 204 });
      }
      if (String(url).includes('save_integration_registry')) return json(false);
      return json([]);
    });
    const repo = new SupabaseIntegrationRepository(config, http);
    await repo.saveAccount(owner, connection);
    await expect(
      repo.save(owner, 0, new MemoryRepository().state),
    ).rejects.toThrow('Registry changed');
  });
});
describe('paginated bounded sync and rich data', () => {
  it('backfills multiple pages, checkpoints, links Gym and is idempotent on repeat', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    const repo = new MemoryRepository();
    const http = vi.fn<typeof fetch>(async (url) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe(
        'https://www.strava.com/api/v3/athlete/activities',
      );
      expect(u.searchParams.get('per_page')).toBe('50');
      return json(
        u.searchParams.get('page') === '1'
          ? Array.from({ length: 50 }, (_, i) => ({
              ...activityRaw(i + 1, 'WeightTraining'),
              start_date: new Date(
                Date.UTC(2026, 9, 1, 0, i * 70),
              ).toISOString(),
            }))
          : [],
      );
    });
    const client = new StravaClient(config, http);
    const gym = [
      {
        id: 'local-one',
        title: 'Local workout',
        startedAt: '2026-10-01T00:00:00Z',
        endedAt: null,
        durationMinutes: 60,
        source: 'hevy_import',
      },
    ];
    expect(
      (await syncPage(owner, repo, config, { gym, full: true }, client)).page,
    ).toBe(2);
    expect(repo.state.activities).toHaveLength(50);
    expect(repo.state.activities.filter((a) => a.gymWorkoutId)).toHaveLength(1);
    vi.advanceTimersByTime(2100);
    expect((await syncPage(owner, repo, config, {}, client)).done).toBe(true);
    vi.advanceTimersByTime(2100);
    await syncPage(owner, repo, config, { full: true }, client);
    expect(repo.state.activities).toHaveLength(50);
    expect(repo.state.sources).toHaveLength(51);
    expect(http).toHaveBeenCalledTimes(3);
  });
  it('rejects a malformed page atomically and keeps its cursor/counters retryable', async () => {
    const repo = new MemoryRepository();
    const client = new StravaClient(config, async () =>
      json([activityRaw(), { ...activityRaw(2), elapsed_time: 'bad' }]),
    );
    await expect(syncPage(owner, repo, config, {}, client)).rejects.toThrow();
    expect(repo.state.activities).toHaveLength(0);
    expect(repo.state.sync.page).toBe(1);
    expect(repo.state.sync.discovered).toBe(0);
    expect(repo.state.sync.errors).toHaveLength(1);
  });
  it('honors read/overall budgets and Retry-After, including daily UTC reset', () => {
    const now = Date.parse('2026-10-04T10:01:00Z');
    expect(
      ratePause(
        new Headers({
          'X-ReadRateLimit-Limit': '100,1000',
          'X-ReadRateLimit-Usage': '99,20',
        }),
        now,
      ),
    ).toBe(Date.parse('2026-10-04T10:15:01Z'));
    expect(
      ratePause(
        new Headers({
          'X-RateLimit-Limit': '100,1000',
          'X-RateLimit-Usage': '1,999',
        }),
        now,
      ),
    ).toBe(Date.parse('2026-10-05T00:00:01Z'));
    expect(ratePause(new Headers({ 'Retry-After': '60' }), now)).toBe(
      now + 60000,
    );
    expect(ratePause(new Headers(), now)).toBe(0);
  });
  it('persists 429 pause and blocks subsequent requests without calling Strava', async () => {
    const repo = new MemoryRepository(),
      http = vi.fn<typeof fetch>(async () =>
        json({}, 429, { 'Retry-After': '120' }),
      ),
      client = new StravaClient(config, http);
    await expect(
      syncPage(owner, repo, config, {}, client),
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.state.sync.blockedUntil).toBeGreaterThan(Date.now());
    await expect(
      syncPage(owner, repo, config, {}, client),
    ).rejects.toMatchObject({ status: 429 });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('fetches bounded detail/streams/laps separately from registry, preserving missing HR/GPS', async () => {
    const repo = new MemoryRepository(),
      n = normalizeStrava(activityRaw(), '7');
    ingestActivity(repo.state, n.activity, n.source);
    const http = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/streams?')
        ? json({ time: { data: [0, 1] }, distance: { data: [0, 3] } })
        : String(url).endsWith('/laps')
          ? json([{ distance: 1000, elapsed_time: 300 }])
          : json({ ...activityRaw(), device_name: 'Synthetic device' }),
    );
    const rich = await enrichActivity(
      owner,
      n.source.key,
      repo,
      config,
      new StravaClient(config, http),
    );
    expect(http).toHaveBeenCalledTimes(3);
    expect(rich.streams).toHaveLength(2);
    expect(rich.laps[0].averageHr).toBeNull();
    expect(repo.state.activities[0].device).toBe('Synthetic device');
    expect(repo.state).not.toHaveProperty('streams');
    expect(repo.richData[n.source.key]).toEqual(rich);
  });
  it('does not fetch laps for non-running activity and accepts absent streams', async () => {
    const repo = new MemoryRepository(),
      n = normalizeStrava(activityRaw(1, 'Swim'), '7');
    ingestActivity(repo.state, n.activity, n.source);
    const http = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/streams?')
        ? json({}, 404)
        : json(activityRaw(1, 'Swim')),
    );
    const r = await enrichActivity(
      owner,
      n.source.key,
      repo,
      config,
      new StravaClient(config, http),
    );
    expect(http).toHaveBeenCalledTimes(2);
    expect(r.streams).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});
describe('webhook verification, fast queue and processing', () => {
  const event = {
    object_type: 'activity' as const,
    object_id: 1,
    aspect_type: 'create' as const,
    owner_id: 7,
    subscription_id: 42,
    event_time: 1791100000,
    updates: {},
  };
  it('verifies challenge and validates subscription before enqueueing', async () => {
    expect(
      webhookChallenge(
        new URL(
          'https://example.com?hub.mode=subscribe&hub.verify_token=synthetic&hub.challenge=123',
        ),
        'synthetic',
      ),
    ).toEqual({ 'hub.challenge': '123' });
    expect(() =>
      webhookChallenge(new URL('https://example.com'), 'synthetic'),
    ).toThrow();
    const repo = new MemoryRepository();
    await queueWebhook(event, 42, repo);
    await queueWebhook(event, 42, repo);
    expect(repo.jobs).toHaveLength(1);
    await expect(queueWebhook(event, 43, repo)).rejects.toThrow();
    await expect(
      queueWebhook({ ...event, aspect_type: 'invalid' }, 42, repo),
    ).rejects.toThrow();
  });
  it('processes create, update, delete by checking provider truth and retains history', async () => {
    const repo = new MemoryRepository();
    await queueWebhook(event, 42, repo);
    await processWebhook(
      owner,
      repo,
      config,
      new StravaClient(config, async () => json(activityRaw())),
    );
    expect(repo.state.activities).toHaveLength(1);
    expect(repo.jobs).toHaveLength(0);
    await queueWebhook(
      { ...event, aspect_type: 'update', event_time: 1791100001 },
      42,
      repo,
    );
    await processWebhook(
      owner,
      repo,
      config,
      new StravaClient(config, async () =>
        json({ ...activityRaw(), name: 'Provider update' }),
      ),
    );
    expect(repo.state.activities[0].title).toBe('Provider update');
    await queueWebhook(
      { ...event, aspect_type: 'delete', event_time: 1791100002 },
      42,
      repo,
    );
    await processWebhook(
      owner,
      repo,
      config,
      new StravaClient(config, async () => json({}, 404)),
    );
    expect(repo.state.activities[0].status).toBe('source_deleted');
    expect(repo.state.sources[0].deleted).toBe(true);
    expect(repo.state.sources[0].previous).toHaveLength(1);
  });
  it('does not erase an existing activity merely because an unauthenticated event says delete', async () => {
    const repo = new MemoryRepository();
    await queueWebhook({ ...event, aspect_type: 'delete' }, 42, repo);
    await processWebhook(
      owner,
      repo,
      config,
      new StravaClient(config, async () => json(activityRaw())),
    );
    expect(repo.state.activities[0].status).toBe('confirmed');
  });
  it('preserves matched Gym sessions when provider copy is deleted', () => {
    const repo = new MemoryRepository();
    registerGymLinks(
      repo.state,
      [
        {
          id: 'local-one',
          title: 'Gym',
          startedAt: '2026-10-01T08:00:00Z',
          endedAt: null,
          durationMinutes: 60,
          source: 'local_logger',
        },
      ],
      '2026-10-04T00:00:00Z',
    );
    const n = normalizeStrava(activityRaw(1, 'WeightTraining'), '7');
    ingestActivity(repo.state, n.activity, n.source);
    markSourceDeleted(repo.state, 1, 7);
    expect(repo.state.activities[0].status).toBe('confirmed');
    expect(repo.state.activities[0].gymWorkoutId).toBe('local-one');
  });
  it('checks deauthorization against Strava before removing credentials, never deletes history', async () => {
    const repo = new MemoryRepository();
    repo.state.activities.push(normalizeStrava(activityRaw(), '7').activity);
    await queueWebhook(
      {
        ...event,
        object_type: 'athlete',
        aspect_type: 'update',
        updates: { authorized: 'false' },
      },
      42,
      repo,
    );
    await processWebhook(
      owner,
      repo,
      config,
      new StravaClient(config, async () => json({}, 401)),
    );
    expect(repo.credential).toBeNull();
    expect(repo.state.activities).toHaveLength(1);
  });
  it('retains failed jobs and persists rate budget for resuming', async () => {
    const repo = new MemoryRepository();
    await queueWebhook(event, 42, repo);
    await expect(
      processWebhook(
        owner,
        repo,
        config,
        new StravaClient(config, async () =>
          json({}, 429, { 'Retry-After': '60' }),
        ),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.jobs).toHaveLength(1);
    expect(repo.state.sync.blockedUntil).toBeGreaterThan(Date.now());
  });
});

it('expired refresh grants requiring reconnect remove credentials but keep canonical history', async () => {
  const repo = new MemoryRepository();
  repo.credential = { ...connection, expiresAt: 1 };
  const n = normalizeStrava(activityRaw(), '7');
  ingestActivity(repo.state, n.activity, n.source);
  await expect(
    authorizedCall(
      'owner',
      repo,
      new StravaClient(config, async () => json({}, 400)),
      async () => [],
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(repo.credential).toBeNull();
  expect(repo.state.activities).toHaveLength(1);
});
