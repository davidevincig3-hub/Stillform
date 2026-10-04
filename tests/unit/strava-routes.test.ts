import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config, MemoryRepository } from '../helpers/integrations';
import { newOAuthState } from '../../src/server/integration-security';
const mocked = vi.hoisted(() => ({
  owner: vi.fn(),
  consume: vi.fn(),
  repo: vi.fn(),
  setState: vi.fn(),
  origin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../src/server/integration-auth', () => ({
  AuthError: class extends Error {
    status = 401;
  },
  requireOwner: mocked.owner,
  consumeState: mocked.consume,
  setState: mocked.setState,
  checkOrigin: mocked.origin,
  loginSession: mocked.login,
  logoutSession: mocked.logout,
}));
vi.mock('../../src/server/integration-repository', () => ({
  integrationRepository: mocked.repo,
}));
import { GET } from '../../src/app/api/integrations/[action]/route';
let repo: MemoryRepository;
beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', config.origin);
  vi.stubEnv('STRAVA_CLIENT_ID', config.clientId);
  vi.stubEnv('STRAVA_CLIENT_SECRET', config.clientSecret);
  vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', config.encryptionKey);
  vi.stubEnv('SUPABASE_URL', config.supabaseUrl);
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', config.supabaseKey);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', config.serviceKey);
  repo = new MemoryRepository();
  mocked.owner.mockResolvedValue('owner');
  mocked.repo.mockReturnValue(repo);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function callback(query: string) {
  return GET(
    new Request(`${config.origin}/api/integrations/callback?${query}`),
    { params: Promise.resolve({ action: 'callback' }) },
  );
}
describe('OAuth callback routes and safe status', () => {
  it('handles denial without exchanging code or altering tokens', async () => {
    const s = newOAuthState('owner', config.encryptionKey);
    mocked.consume.mockResolvedValue(s.cookie);
    const http = vi.fn();
    vi.stubGlobal('fetch', http);
    const result = await callback(`state=${s.nonce}&error=access_denied`);
    expect(result.headers.get('location')).toBe(
      `${config.origin}/integrations?strava=denied`,
    );
    expect(http).not.toHaveBeenCalled();
    expect(repo.saves).toHaveLength(0);
    expect(mocked.consume).toHaveBeenCalledOnce();
  });
  it('rejects missing scope before exchanging and invalid state before denial', async () => {
    const s = newOAuthState('owner', config.encryptionKey);
    mocked.consume.mockResolvedValue(s.cookie);
    const http = vi.fn();
    vi.stubGlobal('fetch', http);
    expect(
      (
        await callback(`state=${s.nonce}&code=synthetic&scope=activity:read`)
      ).headers.get('location'),
    ).toContain('missing_scope');
    expect(
      (await callback('state=wrong&error=access_denied')).headers.get(
        'location',
      ),
    ).toContain('state_error');
    expect(http).not.toHaveBeenCalled();
  });
  it('saves successful exchanges server-side and redirects without token/code leakage', async () => {
    const s = newOAuthState('owner', config.encryptionKey);
    mocked.consume.mockResolvedValue(s.cookie);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'synthetic-exchanged-access',
              refresh_token: 'synthetic-exchanged-refresh',
              expires_at: 4102444800,
              scope: 'activity:read_all activity:read',
              athlete: { id: 7 },
            }),
          ),
      ),
    );
    const result = await callback(
      `state=${s.nonce}&code=synthetic-code&scope=activity:read,activity:read_all`,
    );
    expect(result.headers.get('location')).toBe(
      `${config.origin}/integrations?strava=connected`,
    );
    expect(repo.saves[0].refreshToken).toBe('synthetic-exchanged-refresh');
    expect(await result.text()).not.toContain('synthetic-exchanged');
  });
  it('status returns safe identity/scopes without OAuth credentials or configuration values', async () => {
    const response = await GET(
      new Request(`${config.origin}/api/integrations/status`),
      { params: Promise.resolve({ action: 'status' }) },
    );
    const text = await response.text();
    expect(text).toContain('athleteId');
    for (const secret of [
      config.clientSecret,
      config.serviceKey,
      'synthetic-access',
      'synthetic-refresh',
      config.encryptionKey,
    ])
      expect(text).not.toContain(secret);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
