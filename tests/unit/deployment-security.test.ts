import { it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { integrationConfig } from '../../src/server/integration-config';
import { checkOrigin } from '../../src/server/integration-auth';
import {
  parseTrustedOrigin,
  trustedRequestOrigin,
} from '../../src/server/trusted-origins';
import { hasAppSession, privateAppEnabled } from '../../src/server/app-access';
import { seal } from '../../src/server/integration-security';
import { safeReturnPath } from '../../src/domain/return-path';
import { proxy } from '../../src/proxy';

it('allows exact same-origin writes on canonical production, explicit localhost and trusted development LAN, without changing OAuth callback origin', () => {
  const env = {
    NODE_ENV: 'development',
    APP_ORIGIN: 'https://stillform.example.test',
    APP_TRUSTED_ORIGINS: 'http://localhost:3000',
    STILLFORM_LAN_HOST: '192.168.10.20',
  };
  for (const origin of [
    'https://stillform.example.test',
    'http://localhost:3000',
    'https://192.168.10.20:3000',
  ]) {
    const request = new Request(`${origin}/api/polar/quality`, {
      method: 'POST',
      headers: { origin },
    });
    const c = integrationConfig(env, request);
    expect(c.origin).toBe(origin);
    expect(c.callbackOrigin).toBe(env.APP_ORIGIN);
    expect(() => checkOrigin(request, c)).not.toThrow();
    expect(() =>
      checkOrigin(
        new Request(request.url, {
          method: 'POST',
          headers: { origin: 'https://foreign.test' },
        }),
        c,
      ),
    ).toThrow('origin rejected');
  }
  const c = integrationConfig(env);
  const loopbackRequest = new Request('http://127.0.0.1:3000/api/session', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  });
  expect(() =>
    checkOrigin(loopbackRequest, integrationConfig(env, loopbackRequest)),
  ).not.toThrow();
  for (const origin of [
    'http://192.168.10.20:3000',
    'https://192.168.10.21:3000',
    'https://stillform.example.test.evil.test',
    'https://preview.example.test',
  ])
    expect(() =>
      checkOrigin(
        new Request(`${origin}/api/polar/quality`, { headers: { origin } }),
        c,
      ),
    ).toThrow();
});
it('rejects wildcards, credentials, paths and external HTTP; forwarded headers do not grant trust', () => {
  for (const origin of [
    'https://*.example.test',
    'https://user:secret@example.test',
    'https://example.test/path',
    'http://example.test',
    'https://example.test?x=1',
  ])
    expect(() => parseTrustedOrigin(origin)).toThrow();
  const c = integrationConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://stillform.example.test',
    STILLFORM_LAN_HOST: '192.168.10.20',
  });
  expect(
    trustedRequestOrigin(
      new Request('https://foreign.test/api/session', {
        headers: {
          'x-forwarded-host': 'stillform.example.test',
          'x-forwarded-proto': 'https',
        },
      }),
      c,
    ),
  ).toBeNull();
  expect(c.trustedOrigins).not.toContain('https://192.168.10.20:3000');
});
it('production page gate rejects absent/tampered/stale cookies, accepts encrypted sessions, and leaves local mode unchanged', () => {
  const key = 'ab'.repeat(32),
    now = Date.now();
  const cookie = seal(
    {
      owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: 'synthetic-only',
      refreshToken: 'synthetic-only',
      expires: now + 10000,
    },
    key,
  );
  expect(hasAppSession(cookie, key, now)).toBe(true);
  expect(hasAppSession(`${cookie}tampered`, key, now)).toBe(false);
  expect(hasAppSession(undefined, key, now)).toBe(false);
  expect(hasAppSession(cookie, key, now + 21610001)).toBe(false);
  expect(privateAppEnabled({ VERCEL_ENV: 'production' })).toBe(true);
  vi.stubEnv('APP_REQUIRE_AUTH', 'true');
  vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', key);
  const blocked = proxy(new NextRequest('https://stillform.example.test/gym'));
  expect(blocked.headers.get('location')).toBe(
    'https://stillform.example.test/login?next=%2Fgym',
  );
  const allowed = proxy(
    new NextRequest('https://stillform.example.test/gym', {
      headers: { cookie: `stillform-integration-session=${cookie}` },
    }),
  );
  expect(allowed.headers.get('location')).toBeNull();
  expect(allowed.headers.get('cache-control')).toBe('private, no-store');
  vi.unstubAllEnvs();
  expect(privateAppEnabled({ NODE_ENV: 'development' })).toBe(false);
});
it('login return paths cannot navigate to foreign origins or API actions', () => {
  for (const path of [
    '//evil.test',
    'https://evil.test',
    '/\\evil.test',
    '/\n/evil.test',
    '/api/polar/connect',
    '/login',
  ])
    expect(safeReturnPath(path)).toBe('/gym');
  expect(safeReturnPath('/running')).toBe('/running');
});
