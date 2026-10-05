import { it, expect, vi, afterEach } from 'vitest';
import {
  PolarClient,
  PolarError,
  POLAR_ENDPOINTS,
} from '../../src/server/polar-client';
import {
  polarAuthorized,
  polarSyncStep,
  polarMetadata,
  publicPolarState,
} from '../../src/server/polar-service';
import { polarStoreSchema, emptyPolarStore } from '../../src/domain/polar';
import { MemoryRepository, json } from '../helpers/integrations';
import { polarConfig, polarConnection } from '../helpers/polar-server';
import { SupabaseIntegrationRepository } from '../../src/server/integration-repository';
import { seal } from '../../src/server/integration-security';

afterEach(() => vi.useRealTimers());
function repository() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  const repo = new MemoryRepository();
  repo.polarCredential = structuredClone(polarConnection);
  return repo;
}

it.each([400, 403, 500, 503])(
  'retains sanitized JSON diagnostics for HTTP %s, with exact registry request shape',
  async (status) => {
    const http = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(
        `${POLAR_ENDPOINTS.api}/training-sessions/list?from=2026-09-01T00%3A00%3A00&to=2026-10-05T00%3A00%3A00`,
      );
      return Response.json(
        {
          errorMessage: 'Invalid date range',
          nested: { access_token: 'unrecognized-token' },
          echo: [
            polarConnection.accessToken,
            polarConnection.refreshToken,
            polarConfig.polarClientSecret,
            polarConfig.encryptionKey,
            polarConfig.secretKey,
            polarConfig.serviceKey,
          ].join(' '),
        },
        { status },
      );
    });
    const error = await new PolarClient(polarConfig, http)
      .window(polarConnection, 'training', '2026-09-01', '2026-10-05')
      .catch((e) => e);
    if (!(error instanceof PolarError) || !error.diagnostic)
      throw new Error('Expected Polar diagnostic');
    expect(error.diagnostic).toMatchObject({
      endpoint: '/v4/data/training-sessions/list',
      status,
      contentType: 'application/json',
      refreshed: false,
      family: 'training',
    });
    expect(error.diagnostic.body).toContain('Invalid date range');
    const diagnostic = JSON.stringify(error.diagnostic);
    for (const secret of [
      polarConnection.accessToken,
      polarConnection.refreshToken,
      polarConfig.polarClientSecret,
      polarConfig.encryptionKey,
      polarConfig.secretKey,
      polarConfig.serviceKey,
      'unrecognized-token',
    ])
      if (secret) expect(diagnostic).not.toContain(secret);
  },
);

it.each([200, 201, 204])(
  'accepts empty HTTP %s credential-write responses while requiring explicit RPC success',
  async (status) => {
    let saved = '';
    const http = async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === 'POST' && path.endsWith('/integration_accounts')) {
        expect(new Headers(init.headers).get('Prefer')).toBe(
          'resolution=merge-duplicates,return=minimal',
        );
        saved = JSON.parse(String(init.body)).credential;
        return new Response(null, { status });
      }
      if (path.endsWith('/integration_accounts'))
        return Response.json([{ credential: saved }]);
      return new Response(null, { status: 200 });
    };
    const repo = new SupabaseIntegrationRepository(polarConfig, http);
    await repo.saveAccount('owner', polarConnection, 'polar');
    expect(await repo.account('owner', 'polar')).toEqual(polarConnection);
    await expect(repo.savePolar('owner', 0, emptyPolarStore())).rejects.toThrow(
      'Polar state changed',
    );
  },
);

it('normal refresh completes after an atomic token-pair upsert returns empty HTTP 200', async () => {
  repository();
  let stored = seal(
    { ...polarConnection, expiresAt: 1 },
    polarConfig.encryptionKey,
  );
  const repo = new SupabaseIntegrationRepository(
    polarConfig,
    async (url, init) => {
      expect(String(url)).toContain('integration_accounts');
      if (init?.method === 'POST') {
        stored = JSON.parse(String(init.body)).credential;
        return new Response(null, { status: 200 });
      }
      return Response.json([{ credential: stored }]);
    },
  );
  const client = new PolarClient(polarConfig, async (url) => {
    if (String(url) === POLAR_ENDPOINTS.token)
      return Response.json({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        token_type: 'bearer',
      });
    expect(await repo.account('owner', 'polar')).toMatchObject({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });
    return Response.json([]);
  });
  await expect(
    polarAuthorized('owner', repo, client, (c) =>
      client.get(c, '/sports/list'),
    ),
  ).resolves.toEqual([]);
});

it('retains the exact real-provider datetime validation error instead of collapsing HTTP 400', async () => {
  const repo = repository();
  const client = new PolarClient(polarConfig, async () =>
    Response.json(
      { error: "Value for key 'from' could not be parsed as datetime" },
      { status: 400 },
    ),
  );
  await expect(
    polarSyncStep('owner', repo, client, {
      families: ['training'],
      from: '2026-09-01',
      to: '2026-10-05',
      restart: true,
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(repo.polarState.jobs.training!.diagnostic).toMatchObject({
    status: 400,
    body: JSON.stringify({
      error: "Value for key 'from' could not be parsed as datetime",
    }),
    refreshed: false,
  });
});

it('retains HTML error text without markup, scripts, Authorization credentials or partial-token truncation', async () => {
  const http = async () =>
    new Response(
      `<html><style>css</style><script>code()</script><h1>HTTP Status 502</h1><p>Bearer arbitrary-value ${'x'.repeat(3990)} ${polarConnection.refreshToken}</p></html>`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      },
    );
  const error = await new PolarClient(polarConfig, http)
    .get(polarConnection, '/user-devices')
    .catch((e) => e);
  if (!(error instanceof PolarError) || !error.diagnostic)
    throw new Error('Expected Polar diagnostic');
  expect(error.diagnostic).toMatchObject({
    status: 502,
    contentType: 'text/html;charset=utf-8',
    family: 'context',
  });
  expect(error.diagnostic.body).toContain('HTTP Status 502');
  expect(error.diagnostic.body.length).toBeLessThanOrEqual(4000);
  for (const text of [
    '<html>',
    'code()',
    'css',
    'arbitrary-value',
    polarConnection.refreshToken,
  ])
    expect(error.diagnostic.body).not.toContain(text);
});

it('persists post-refresh training diagnostics in the checkpoint without importing sessions', async () => {
  const repo = repository();
  repo.polarCredential!.expiresAt = 1;
  const http = async (url: RequestInfo | URL) =>
    String(url) === POLAR_ENDPOINTS.token
      ? json({
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_in: 3600,
          token_type: 'bearer',
        })
      : json({ errorMessage: 'Training endpoint rejected this range' }, 400);
  await expect(
    polarSyncStep('owner', repo, new PolarClient(polarConfig, http), {
      families: ['training'],
      from: '2026-09-01',
      to: '2026-10-05',
      restart: true,
    }),
  ).rejects.toMatchObject({ status: 400, diagnostic: { refreshed: true } });
  expect(repo.polarCredential).toMatchObject({
    accessToken: 'rotated-access',
    refreshToken: 'rotated-refresh',
  });
  const job = publicPolarState(repo.polarState).jobs.training!;
  expect(job.diagnostic).toMatchObject({
    status: 400,
    refreshed: true,
    family: 'training',
  });
  expect(job.diagnostic!.body).toContain(
    'Training endpoint rejected this range',
  );
  expect(job.next).toBe('2026-09-01');
  expect(repo.state.sources).toHaveLength(0);
  expect(
    polarStoreSchema.parse(repo.polarState).jobs.training!.diagnostic,
  ).toEqual(job.diagnostic);
});

it('keeps context failure diagnostics in status and does not delete credentials on a failed refresh', async () => {
  const repo = repository();
  await expect(
    polarMetadata(
      'owner',
      repo,
      new PolarClient(polarConfig, async () =>
        json({ errorMessage: 'Context unavailable' }, 503),
      ),
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(publicPolarState(repo.polarState).contextDiagnostic).toMatchObject({
    status: 503,
    family: 'context',
    refreshed: false,
  });
  repo.polarCredential!.expiresAt = 1;
  const before = structuredClone(repo.polarCredential);
  await expect(
    polarAuthorized(
      'owner',
      repo,
      new PolarClient(polarConfig, async () =>
        json({ error: 'invalid_grant' }, 400),
      ),
      async () => null,
    ),
  ).rejects.toMatchObject({
    status: 401,
    diagnostic: {
      status: 400,
      family: 'authentication',
      refreshed: false,
      refreshAttempted: true,
    },
  });
  expect(repo.polarCredential).toEqual(before);
});

it('defaults diagnostics for existing persisted state and retains refresh details after one reactive 401', async () => {
  const old = emptyPolarStore();
  const { contextDiagnostic, ...legacy } = old;
  expect(contextDiagnostic).toBeNull();
  expect(polarStoreSchema.parse(legacy).contextDiagnostic).toBeNull();
  const repo = repository();
  let requests = 0;
  const http = async (url: RequestInfo | URL) =>
    String(url) === POLAR_ENDPOINTS.token
      ? json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'bearer',
        })
      : ++requests === 1
        ? json({}, 401)
        : json({ errorMessage: 'Still forbidden' }, 403);
  const client = new PolarClient(polarConfig, http);
  await expect(
    polarAuthorized('owner', repo, client, (c) =>
      client.get(c, '/sports/list'),
    ),
  ).rejects.toMatchObject({
    status: 403,
    diagnostic: { refreshed: true, family: 'context' },
  });
  expect(requests).toBe(2);
});
