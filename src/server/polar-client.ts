import 'server-only';
import { z } from 'zod';
import type { IntegrationConfig } from './integration-config';
import type { Connection } from './strava-client';
import {
  addDays,
  windowDays,
  type PolarFamily,
  type PolarDiagnostic,
} from '../domain/polar';
import { sanitizedPolarBody, polarDiagnosticFamily } from './polar-diagnostics';
export const POLAR_ENDPOINTS = {
  api: 'https://www.polaraccesslink.com/v4/data',
  authorize: 'https://auth.polar.com/oauth/authorize',
  token: 'https://auth.polar.com/oauth/token',
};
export const POLAR_PATHS = {
  training: '/training-sessions/list',
  sleep: '/sleeps',
  nightly: '/nightly-recharge-results',
  continuous: '/continuous-samples',
  ppi: '/ppi-samples',
  devices: '/user-devices',
  sports: '/sports/list',
};
export const TRAINING_FEATURES = [
  'samples',
  'training-load-report',
  'laps',
  'routes',
  'statistics',
  'zones',
  'pause-times',
];
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string().regex(/^bearer$/i),
  scope: z.string().optional(),
});
export class PolarError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAt = 0,
    public diagnostic: PolarDiagnostic | null = null,
  ) {
    super(message);
  }
}
export function polarScopeList(scope: string) {
  return scope.split(/\s+/).filter(Boolean);
}
export class PolarClient {
  constructor(
    private config: IntegrationConfig,
    private http: typeof fetch = fetch,
  ) {}
  private async request(
    url: string,
    init: RequestInit,
    connectionSecrets: string[] = [],
  ) {
    let r: Response;
    try {
      r = await this.http(url, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new PolarError(
        'Polar request unavailable; resume later',
        503,
        Date.now() + 30000,
      );
    }
    if (!r.ok) {
      const authorization =
        new Headers(init.headers).get('Authorization') ?? '';
      const body =
        init.body instanceof URLSearchParams ? [...init.body.values()] : [];
      const secrets = [
        authorization,
        authorization.replace(/^(Bearer|Basic)\s+/i, ''),
        this.config.polarClientSecret,
        this.config.clientSecret,
        this.config.encryptionKey,
        this.config.secretKey,
        this.config.serviceKey,
        ...body,
        ...connectionSecrets,
      ];
      let raw = '';
      try {
        raw = await r.text();
      } catch {
        raw = 'Provider error body unavailable';
      }
      const endpoint = new URL(url).pathname;
      const diagnostic: PolarDiagnostic = {
        endpoint,
        status: r.status,
        contentType: r.headers.get('content-type')
          ? sanitizedPolarBody(r.headers.get('content-type')!, secrets)
          : null,
        body: sanitizedPolarBody(raw, secrets),
        refreshed: false,
        refreshAttempted: false,
        family: polarDiagnosticFamily(endpoint),
      };
      const retry = r.headers.get('Retry-After');
      const seconds = retry ? Number(retry) : NaN;
      const retryAt =
        r.status === 429
          ? Math.max(
              Date.now() + 1000,
              Number.isFinite(seconds)
                ? Date.now() + seconds * 1000
                : retry
                  ? Date.parse(retry) || Date.now() + 900000
                  : Date.now() + 900000,
            )
          : r.status >= 500
            ? Date.now() + 30000
            : 0;
      throw new PolarError(
        r.status === 429
          ? 'Polar rate limit reached; sync is saved for resumption'
          : r.status === 403
            ? 'Polar scope/data family unavailable'
            : r.status === 401
              ? 'Polar authorization expired; reconnect'
              : 'Polar request failed',
        r.status,
        retryAt,
        diagnostic,
      );
    }
    return r.status === 204 ? {} : ((await r.json()) as unknown);
  }
  private async token(body: URLSearchParams) {
    return tokenSchema.parse(
      await this.request(POLAR_ENDPOINTS.token, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.polarClientId}:${this.config.polarClientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
    );
  }
  async exchange(code: string, ownerBinding: string) {
    const t = await this.token(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${this.config.origin}/api/polar/callback`,
      }),
    );
    return {
      athleteId: ownerBinding,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + t.expires_in,
      scopes: polarScopeList(t.scope ?? ''),
      connectedAt: new Date().toISOString(),
    } satisfies Connection;
  }
  async refresh(c: Connection) {
    try {
      const t = await this.token(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: c.refreshToken,
        }),
      );
      return {
        ...c,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + t.expires_in,
        scopes: t.scope === undefined ? c.scopes : polarScopeList(t.scope),
      };
    } catch (e) {
      if (e instanceof PolarError && [400, 401].includes(e.status))
        throw new PolarError(
          'Polar refresh grant expired or revoked; reconnect',
          401,
          0,
          e.diagnostic,
        );
      throw e;
    }
  }
  async get(c: Connection, path: string, params?: URLSearchParams) {
    return this.request(
      `${POLAR_ENDPOINTS.api}${path}${params ? '?' + params : ''}`,
      { headers: { Authorization: `Bearer ${c.accessToken}` } },
      [c.accessToken, c.refreshToken],
    );
  }
  async window(
    c: Connection,
    family: PolarFamily,
    from: string,
    to: string,
    details = false,
  ) {
    const max = details ? 1 : windowDays[family];
    if (to <= from || to > addDays(from, max))
      throw new PolarError('Invalid Polar date window', 400);
    const q = new URLSearchParams({ from, to });
    const features = details
      ? family === 'training'
        ? TRAINING_FEATURES
        : family === 'sleep'
          ? [
              'sleep-result',
              'original-sleep-result',
              'sleep-evaluation',
              'sleep-score',
            ]
          : family === 'ppi'
            ? ['samples']
            : []
      : family === 'continuous'
        ? ['heart-rate-samples']
        : [];
    features.forEach((f) => q.append('features', f));
    return this.get(c, POLAR_PATHS[family], q);
  }
}
