import { NextResponse } from 'next/server';
import {
  integrationConfig,
  missingConfiguration,
  STRAVA_ENDPOINTS,
} from '@/server/integration-config';
import {
  checkOrigin,
  requireOwner,
  loginSession,
  logoutSession,
  setState,
  consumeState,
  AuthError,
} from '@/server/integration-auth';
import {
  newOAuthState,
  validateOAuthState,
} from '@/server/integration-security';
import { integrationRepository } from '@/server/integration-repository';
import {
  StravaClient,
  StravaError,
  requireScopes,
  scopesFrom,
  REQUIRED_SCOPES,
  type Connection,
} from '@/server/strava-client';
import {
  syncPage,
  enrichActivity,
  processWebhook,
} from '@/server/strava-service';
import { resolveActivityMatch } from '@/integrations/activity-matching';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function errorResponse(error: unknown) {
  const status =
    error instanceof AuthError || error instanceof StravaError
      ? error.status
      : 503;
  return NextResponse.json(
    {
      error:
        error instanceof AuthError || error instanceof StravaError
          ? error.message
          : 'Integration operation failed; verify server configuration or retry.',
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(error instanceof StravaError && error.retryAt
          ? {
              'Retry-After': String(
                Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000)),
              ),
            }
          : {}),
      },
    },
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  let config;
  try {
    config = integrationConfig();
    const missing = missingConfiguration(config);
    if (action === 'status' && missing.length)
      return NextResponse.json(
        { configured: false, missing, authenticated: false, connected: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    if (missing.length)
      throw new AuthError(
        'Secure integration configuration is incomplete',
        503,
      );
    const owner = await requireOwner(config),
      repo = integrationRepository(config);
    if (action === 'status') {
      const account = await repo.account(owner),
        snapshot = await repo.read(owner);
      return NextResponse.json(
        {
          configured: true,
          mode: config.mode,
          authenticated: true,
          connected: Boolean(account),
          athleteId: account?.athleteId ?? null,
          scopes: account?.scopes ?? [],
          sync: snapshot.state.sync,
          reviews: snapshot.state.reviews.length,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (action === 'connect') {
      const state = newOAuthState(owner, config.encryptionKey);
      await setState(state.cookie, config);
      const url = new URL(STRAVA_ENDPOINTS.authorize);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: `${config.origin}/api/integrations/callback`,
        scope: REQUIRED_SCOPES.join(','),
        approval_prompt: 'force',
        state: state.nonce,
      }).toString();
      return NextResponse.redirect(url);
    }
    if (action === 'callback') {
      const url = new URL(request.url);
      let message = 'service_error';
      try {
        const cookie = await consumeState();
        try {
          validateOAuthState(
            url.searchParams.get('state') || '',
            cookie,
            owner,
            config.encryptionKey,
          );
        } catch {
          throw new AuthError('Invalid or expired OAuth state');
        }
        if (url.searchParams.get('error')) {
          message = 'denied';
        } else {
          const scopes = scopesFrom(url.searchParams.get('scope') || '');
          requireScopes(scopes);
          const code = url.searchParams.get('code');
          if (!code) throw new AuthError('Missing authorization code');
          const client = new StravaClient(config),
            token = await client.exchange(code);
          if (!token.athlete) throw new AuthError('Missing athlete identity');
          const granted = token.scope ? scopesFrom(token.scope) : scopes;
          const account: Connection = {
            athleteId: String(token.athlete.id),
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: token.expires_at,
            scopes: granted,
            connectedAt: new Date().toISOString(),
          };
          try {
            requireScopes(granted);
          } catch {
            await client.revoke(account);
            throw new StravaError('Required scope missing', 403);
          }
          await repo.lock(owner, () => repo.saveAccount(owner, account));
          message = 'connected';
        }
      } catch (e) {
        message =
          e instanceof StravaError && e.status === 403
            ? 'missing_scope'
            : e instanceof AuthError
              ? 'state_error'
              : 'service_error';
      }
      return NextResponse.redirect(
        `${config.origin}/integrations?strava=${message}`,
      );
    }
    return NextResponse.json(
      { error: 'Unknown integration action' },
      { status: 404 },
    );
  } catch (e) {
    if (action === 'status' && e instanceof AuthError && e.status === 401)
      return NextResponse.json(
        {
          configured: true,
          authenticated: false,
          connected: false,
          mode: config?.mode,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const c = integrationConfig();
    checkOrigin(request, c);
    if (missingConfiguration(c).length)
      throw new AuthError(
        'Secure integration configuration is incomplete',
        503,
      );
    const { action } = await params;
    if (action === 'login') {
      await loginSession(await request.json(), c);
      return NextResponse.json(
        { authenticated: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (action === 'logout') {
      await logoutSession();
      return NextResponse.json({ authenticated: false });
    }
    const owner = await requireOwner(c),
      repo = integrationRepository(c);
    if (action === 'disconnect') {
      await repo.lock(owner, async () => {
        const account = await repo.account(owner);
        if (account) await new StravaClient(c).revoke(account);
        await repo.removeAccount(owner);
      });
      return NextResponse.json({ connected: false, historyRetained: true });
    }
    if (action === 'sync')
      return NextResponse.json(
        await syncPage(owner, repo, c, await request.json()),
      );
    if (action === 'enrich') {
      const body = z
        .object({ sourceKey: z.string() })
        .parse(await request.json());
      await enrichActivity(owner, body.sourceKey, repo, c);
      return NextResponse.json({ enriched: true });
    }
    if (action === 'review') {
      const body = z
        .object({ sourceKey: z.string(), targetId: z.string().nullable() })
        .parse(await request.json());
      await repo.lock(owner, async () => {
        const s = await repo.read(owner);
        resolveActivityMatch(
          s.state,
          body.sourceKey,
          body.targetId,
          new Date().toISOString(),
        );
        await repo.save(owner, s.version, s.state);
      });
      return NextResponse.json({ reviewed: true });
    }
    if (action === 'webhooks')
      return NextResponse.json(await processWebhook(owner, repo, c));
    return NextResponse.json(
      { error: 'Unknown integration action' },
      { status: 404 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
