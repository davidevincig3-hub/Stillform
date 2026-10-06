import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seal, unseal } from '../../src/server/integration-security';
import { config, json } from '../helpers/integrations';
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
import {
  requireOwner,
  loginSession,
  checkOrigin,
  SESSION_COOKIE,
} from '../../src/server/integration-auth';
const owner = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('resolves owner from validated server session, rejects changed identity and missing cookie', async () => {
  jar.get.mockReturnValue({
    value: seal(
      {
        owner,
        accessToken: 'synthetic-supabase-access',
        refreshToken: 'synthetic-supabase-refresh',
        expires: Date.now() + 600000,
      },
      config.encryptionKey,
    ),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ id: owner })),
  );
  expect(await requireOwner(config)).toBe(owner);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ id: '20000000-0000-4000-8000-000000000002' })),
  );
  await expect(requireOwner(config)).rejects.toThrow();
  jar.get.mockReturnValue(undefined);
  await expect(requireOwner(config)).rejects.toThrow();
});
it('Supabase sign-in sets only encrypted HttpOnly cookie, never a browser-readable credential', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        access_token: 'synthetic-supabase-access',
        refresh_token: 'synthetic-supabase-refresh',
        expires_in: 3600,
        user: { id: owner },
      }),
    ),
  );
  expect(
    await loginSession(
      { email: 'synthetic@example.invalid', password: 'synthetic-password' },
      config,
    ),
  ).toBe(owner);
  const [name, value, options] = jar.set.mock.calls[0];
  expect(name).toBe(SESSION_COOKIE);
  expect(value).not.toContain('synthetic-supabase');
  expect(unseal<{ owner: string }>(value, config.encryptionKey).owner).toBe(
    owner,
  );
  expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
});
it('refreshes Supabase app session with server validation and rejects cross-origin POST', async () => {
  jar.get.mockReturnValue({
    value: seal(
      {
        owner,
        accessToken: 'old-synthetic',
        refreshToken: 'old-refresh',
        expires: 1,
      },
      config.encryptionKey,
    ),
  });
  const http = vi.fn<typeof fetch>(async (url) =>
    String(url).includes('/token?')
      ? json({
          access_token: 'new-synthetic',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          user: { id: owner },
        })
      : json({ id: owner }),
  );
  vi.stubGlobal('fetch', http);
  expect(await requireOwner(config)).toBe(owner);
  expect(http).toHaveBeenCalledTimes(2);
  expect(jar.set).toHaveBeenCalledOnce();
  expect(() =>
    checkOrigin(
      new Request(config.origin, {
        headers: { Origin: 'https://attacker.invalid' },
      }),
      config,
    ),
  ).toThrow();
  expect(() =>
    checkOrigin(
      new Request(config.origin, { headers: { Origin: config.origin } }),
      config,
    ),
  ).not.toThrow();
});
it('uses a separate secure Gym cookie without replacing the integration session', async () => {
  const secure = { ...config, origin: 'https://192.168.1.103:3000' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        access_token: 'synthetic-gym-access',
        refresh_token: 'synthetic-gym-refresh',
        expires_in: 3600,
        user: { id: owner },
      }),
    ),
  );
  await loginSession(
    { email: 'synthetic@example.test', password: 'synthetic-only' },
    secure,
    'stillform-gym-session',
  );
  expect(jar.set).toHaveBeenCalledWith(
    'stillform-gym-session',
    expect.any(String),
    expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
  );
  expect(jar.set.mock.calls.every((call) => call[0] !== SESSION_COOKIE)).toBe(
    true,
  );
  jar.get.mockReturnValue({ value: jar.set.mock.calls[0][1] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ id: owner })),
  );
  expect(await requireOwner(secure, 'stillform-gym-session')).toBe(owner);
  expect(jar.get).toHaveBeenCalledWith('stillform-gym-session');
});
