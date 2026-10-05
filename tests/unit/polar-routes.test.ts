import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRepository, json } from '../helpers/integrations';
import { polarConfig, polarConnection } from '../helpers/polar-server';
import { newOAuthState } from '../../src/server/integration-security';
const mock = vi.hoisted(() => ({
  owner: vi.fn(),
  consume: vi.fn(),
  repo: vi.fn(),
  set: vi.fn(),
  origin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../src/server/integration-auth', () => ({
  AuthError: class extends Error {
    status = 401;
  },
  requireOwner: mock.owner,
  consumeState: mock.consume,
  setState: mock.set,
  checkOrigin: mock.origin,
  loginSession: mock.login,
  logoutSession: mock.logout,
}));
vi.mock('../../src/server/integration-repository', () => ({
  integrationRepository: mock.repo,
}));
import { GET, POST } from '../../src/app/api/polar/[action]/route';
import { storePolarRows } from '../../src/server/polar-normalize';
import { sleep } from '../helpers/polar';
let repo: MemoryRepository;
it('quality updates use owner/origin checks, retain raw history and expose filtered recovery without calling Polar', async () => {
  storePolarRows(repo.polarState, 'sleep', [sleep]);
  const before = structuredClone(repo.polarState.sleep[0]);
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  const payload = {
    records: [{ family: 'sleep', date: before.date, device: before.device }],
    status: 'excluded',
    reason: 'sensor_artifact',
  };
  const request = () =>
    new Request(`${polarConfig.origin}/api/polar/quality`, {
      method: 'POST',
      headers: {
        origin: polarConfig.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  mock.origin.mockImplementationOnce(() => {
    throw new Error('Origin rejected');
  });
  expect(
    (await POST(request(), { params: Promise.resolve({ action: 'quality' }) }))
      .status,
  ).toBe(503);
  expect(repo.polarState.sleep[0]).toEqual(before);
  const response = await POST(request(), {
    params: Promise.resolve({ action: 'quality' }),
  });
  expect(response.status).toBe(200);
  expect(mock.origin).toHaveBeenCalled();
  expect(mock.owner).toHaveBeenCalled();
  expect(repo.polarState.sleep[0].raw).toEqual(before.raw);
  expect(http).not.toHaveBeenCalled();
  const recovery = await (
    await GET(new Request(`${polarConfig.origin}/api/polar/recovery`), {
      params: Promise.resolve({ action: 'recovery' }),
    })
  ).json();
  expect(recovery).toMatchObject({
    sleep: [],
    engine: { state: 'insufficient_data', baselineMaturity: 'insufficient' },
    recordCounts: { sleep: { provider: 1, valid: 0, excluded: 1 } },
    history: [
      { validityOverride: { status: 'excluded', reason: 'sensor_artifact' } },
    ],
  });
});
beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', polarConfig.origin);
  vi.stubEnv('POLAR_CLIENT_ID', polarConfig.polarClientId);
  vi.stubEnv('POLAR_CLIENT_SECRET', polarConfig.polarClientSecret);
  vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', polarConfig.encryptionKey);
  vi.stubEnv('SUPABASE_URL', polarConfig.supabaseUrl);
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', polarConfig.supabaseKey);
  vi.stubEnv('SUPABASE_SECRET_KEY', polarConfig.secretKey);
  vi.stubEnv('STRAVA_CLIENT_ID', '');
  vi.stubEnv('STRAVA_CLIENT_SECRET', '');
  repo = new MemoryRepository();
  mock.owner.mockResolvedValue('owner');
  mock.repo.mockReturnValue(repo);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function get(action: string, query = '') {
  return GET(
    new Request(`${polarConfig.origin}/api/polar/${action}?${query}`),
    { params: Promise.resolve({ action }) },
  );
}
it('connect uses v4 scopes, owner-bound state and explicit account confirmation', async () => {
  const r = await get('connect', 'account=confirmed'),
    url = new URL(r.headers.get('location')!);
  expect(url.origin).toBe('https://auth.polar.com');
  expect(url.searchParams.get('scope')).toContain(
    'training_sessions:read sleep:read',
  );
  expect(url.searchParams.get('scope')).not.toContain('profile');
  expect(url.searchParams.get('redirect_uri')).toBe(
    `${polarConfig.origin}/api/polar/callback`,
  );
  expect(mock.set.mock.calls[0][2]).toBe('polar');
  expect((await get('connect')).status).toBe(401);
});
it('denial consumes provider-specific state, invalid/replayed state never exchanges credentials', async () => {
  const s = newOAuthState('owner', polarConfig.encryptionKey);
  mock.consume.mockResolvedValue(s.cookie);
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  expect(
    (await get('callback', `state=${s.nonce}&error=access_denied`)).headers.get(
      'location',
    ),
  ).toContain('polar=denied');
  expect(mock.consume).toHaveBeenCalledWith('polar');
  expect(
    (await get('callback', 'state=invalid&code=synthetic')).headers.get(
      'location',
    ),
  ).toContain('state_error');
  mock.consume.mockResolvedValue('');
  expect(
    (await get('callback', `state=${s.nonce}&code=synthetic`)).headers.get(
      'location',
    ),
  ).toContain('state_error');
  expect(http).not.toHaveBeenCalled();
});
it('partial grants save real-mode zero-history state without requiring Strava credentials', async () => {
  const s = newOAuthState('owner', polarConfig.encryptionKey);
  mock.consume.mockResolvedValue(s.cookie);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        expires_in: 43200,
        token_type: 'bearer',
        scope: 'sleep:read',
      }),
    ),
  );
  const callback = await get('callback', `state=${s.nonce}&code=synthetic`);
  expect(callback.headers.get('location')).toBe(
    `${polarConfig.origin}/integrations?polar=connected`,
  );
  expect(repo.polarCredential?.scopes).toEqual(['sleep:read']);
  expect(repo.credential).not.toBeNull();
  const r = await get('status');
  expect(await r.json()).toMatchObject({
    connected: true,
    trainingCount: 0,
    state: { realMode: true, counts: { sleep: 0 } },
  });
  expect(await (await get('status')).text()).not.toContain('synthetic-access');
  const recovery = await (await get('recovery')).json();
  expect(recovery).toMatchObject({ realMode: true, sleep: [], nightly: [] });
});
it('rejects grants with no data scopes and preserves previous connection', async () => {
  const s = newOAuthState('owner', polarConfig.encryptionKey);
  repo.polarCredential = polarConnection;
  mock.consume.mockResolvedValue(s.cookie);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        access_token: 'synthetic',
        refresh_token: 'synthetic',
        expires_in: 43200,
        token_type: 'bearer',
        scope: 'devices:read',
      }),
    ),
  );
  expect(
    (await get('callback', `state=${s.nonce}&code=synthetic`)).headers.get(
      'location',
    ),
  ).toContain('missing_scope');
  expect(repo.polarCredential).toEqual(polarConnection);
});
it('disconnect removes Polar tokens only, retains real-mode history and makes no invented revoke request', async () => {
  repo.polarCredential = polarConnection;
  repo.polarState.realMode = true;
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  const r = await POST(
    new Request(`${polarConfig.origin}/api/polar/disconnect`, {
      method: 'POST',
      headers: { origin: polarConfig.origin },
    }),
    { params: Promise.resolve({ action: 'disconnect' }) },
  );
  expect(await r.json()).toMatchObject({ historyRetained: true });
  expect(repo.polarCredential).toBeNull();
  expect(repo.credential).not.toBeNull();
  expect(repo.polarState.realMode).toBe(true);
  expect(http).not.toHaveBeenCalled();
});
