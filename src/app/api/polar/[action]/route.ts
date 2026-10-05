import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  integrationConfig,
  missingConfiguration,
} from '@/server/integration-config';
import {
  requireOwner,
  checkOrigin,
  loginSession,
  logoutSession,
  setState,
  consumeState,
  AuthError,
} from '@/server/integration-auth';
import { integrationRepository } from '@/server/integration-repository';
import {
  newOAuthState,
  validateOAuthState,
} from '@/server/integration-security';
import {
  PolarClient,
  PolarError,
  POLAR_ENDPOINTS,
} from '@/server/polar-client';
import {
  polarSyncStep,
  polarMetadata,
  enrichPolar,
  publicPolarState,
} from '@/server/polar-service';
import { polarScopes, familyScope } from '@/domain/polar';
import { setPolarValidity, publicRecovery } from '@/server/recovery-quality';
import { polarRecoveryEngineInput } from '@/server/recovery-engine-input';
import { assessRecovery } from '@/analytics/recovery-engine';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function error(e: unknown) {
  return response(
    {
      error:
        e instanceof AuthError || e instanceof PolarError
          ? e.message
          : e instanceof z.ZodError
            ? 'Invalid request or provider response'
            : 'Polar operation unavailable; verify configuration or resume',
      retryAt: e instanceof PolarError ? e.retryAt : 0,
      diagnostic: e instanceof PolarError ? e.diagnostic : null,
    },
    e instanceof AuthError || e instanceof PolarError
      ? e.status
      : e instanceof z.ZodError
        ? 400
        : 503,
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  let c;
  try {
    c = integrationConfig();
    const missing = missingConfiguration(c, 'polar');
    if (action === 'status' && missing.length)
      return response({
        configured: false,
        authenticated: false,
        connected: false,
        missing,
        trainingTimeZone: c.polarTimeZone,
      });
    if (missing.length)
      throw new AuthError('Polar secure configuration incomplete', 503);
    const owner = await requireOwner(c),
      repo = integrationRepository(c);
    if (action === 'status') {
      const account = await repo.account(owner, 'polar'),
        p = await repo.readPolar(owner),
        registry = await repo.read(owner);
      return response({
        configured: true,
        authenticated: true,
        connected: !!account,
        mode: c.mode,
        scopes: account?.scopes ?? [],
        trainingTimeZone: c.polarTimeZone,
        state: publicPolarState(p.state),
        trainingCount: registry.state.sources.filter(
          (s) => s.provider === 'polar' && !s.deleted,
        ).length,
      });
    }
    if (action === 'recovery') {
      const p = await repo.readPolar(owner),
        connected = !!(await repo.account(owner, 'polar'));
      const asOf = new Date().toISOString(),
        registry = await repo.read(owner);
      const engineInput = polarRecoveryEngineInput(
        p.state,
        registry.state,
        asOf,
        c.polarTimeZone!,
      );
      return response({
        ...publicRecovery(p.state, connected, asOf),
        engine: assessRecovery(engineInput),
        engineInput,
      });
    }
    if (action === 'connect') {
      if (new URL(request.url).searchParams.get('account') !== 'confirmed')
        throw new AuthError(
          'Confirm your own Polar account, or the same account when reconnecting',
          400,
        );
      const state = newOAuthState(owner, c.encryptionKey);
      await setState(state.cookie, c, 'polar');
      const url = new URL(POLAR_ENDPOINTS.authorize);
      url.search = new URLSearchParams({
        client_id: c.polarClientId,
        response_type: 'code',
        redirect_uri: `${c.origin}/api/polar/callback`,
        scope: polarScopes.join(' '),
        state: state.nonce,
      }).toString();
      return NextResponse.redirect(url);
    }
    if (action === 'callback') {
      let message = 'service_error';
      try {
        const url = new URL(request.url),
          cookie = await consumeState('polar');
        try {
          validateOAuthState(
            url.searchParams.get('state') ?? '',
            cookie,
            owner,
            c.encryptionKey,
          );
        } catch {
          throw new AuthError('Invalid Polar OAuth state');
        }
        if (url.searchParams.get('error')) message = 'denied';
        else {
          const code = url.searchParams.get('code');
          if (!code) throw new AuthError('Missing authorization code');
          const account = await new PolarClient(c).exchange(code, owner);
          if (
            !Object.values(familyScope).some((s) => account.scopes.includes(s))
          )
            throw new PolarError('No relevant Polar data scope granted', 403);
          await repo.lock(owner, async () => {
            await repo.saveAccount(owner, account, 'polar');
            const p = await repo.readPolar(owner);
            p.state.realMode = true;
            await repo.savePolar(owner, p.version, p.state);
          });
          message = 'connected';
        }
      } catch (e) {
        message =
          e instanceof AuthError
            ? 'state_error'
            : e instanceof PolarError && e.status === 403
              ? 'missing_scope'
              : 'service_error';
      }
      return NextResponse.redirect(`${c.origin}/integrations?polar=${message}`);
    }
    return response({ error: 'Unknown Polar action' }, 404);
  } catch (e) {
    if (action === 'status' && e instanceof AuthError && e.status === 401)
      return response({
        configured: true,
        authenticated: false,
        connected: false,
        mode: c?.mode,
        trainingTimeZone: c?.polarTimeZone,
      });
    return error(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const c = integrationConfig();
    checkOrigin(request, c);
    const { action } = await params;
    if (
      missingConfiguration(
        c,
        ['login', 'logout'].includes(action) ? 'shared' : 'polar',
      ).length
    )
      throw new AuthError('Polar secure configuration incomplete', 503);
    if (action === 'login') {
      await loginSession(await request.json(), c);
      return response({ authenticated: true });
    }
    if (action === 'logout') {
      await logoutSession();
      return response({ authenticated: false });
    }
    const owner = await requireOwner(c),
      repo = integrationRepository(c),
      client = new PolarClient(c);
    if (action === 'disconnect') {
      await repo.lock(owner, () => repo.removeAccount(owner, 'polar'));
      return response({
        connected: false,
        historyRetained: true,
        revokeInstructions:
          'Local tokens removed. Revoke the app grant in your Polar account settings as well; v4 has no documented revocation endpoint.',
      });
    }
    if (action === 'sync')
      return response(
        await polarSyncStep(owner, repo, client, await request.json()),
      );
    if (action === 'quality')
      return response(
        await setPolarValidity(owner, repo, await request.json()),
      );
    if (action === 'metadata')
      return response(await polarMetadata(owner, repo, client));
    if (action === 'enrich') {
      const input = z
        .object({ sourceKey: z.string().min(1) })
        .parse(await request.json());
      await enrichPolar(owner, input.sourceKey, repo, client);
      return response({ enriched: true });
    }
    return response({ error: 'Unknown Polar action' }, 404);
  } catch (e) {
    return error(e);
  }
}
