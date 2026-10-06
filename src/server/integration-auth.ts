import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { IntegrationConfig } from './integration-config';
import { seal, unseal, secretEqual } from './integration-security';
import { DEV_OWNER } from './integration-repository';
import { trustedRequestOrigin } from './trusted-origins';
import { authSession } from './auth-session';
export const SESSION_COOKIE = 'stillform-integration-session',
  STATE_COOKIE = 'stillform-strava-state';
export class AuthError extends Error {
  constructor(
    message = 'Sign in to integrations first',
    public status = 401,
  ) {
    super(message);
  }
}
function cookieOptions(c: IntegrationConfig, maxAge: number) {
  return {
    httpOnly: true,
    secure: c.origin.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
export function checkOrigin(request: Request, c: IntegrationConfig) {
  const origin = trustedRequestOrigin(request, c);
  if (!origin || request.headers.get('origin') !== origin)
    throw new AuthError('Request origin rejected', 403);
}
async function authRequest(c: IntegrationConfig, path: string, body: unknown) {
  const r = await fetch(`${c.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: c.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new AuthError('Integration sign-in failed');
  return z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
      expires_at: z.number().optional(),
      expires_in: z.number(),
      user: z.object({ id: z.uuid() }),
    })
    .parse(await r.json());
}
export async function loginSession(
  input: unknown,
  c: IntegrationConfig,
  cookieName = SESSION_COOKIE,
) {
  const data = z
    .object({
      email: z.string().optional(),
      password: z.string().optional(),
      accessKey: z.string().optional(),
    })
    .parse(input);
  let session: z.infer<typeof authSession>;
  if (c.mode === 'dev-file') {
    if (
      c.devAccessKey.length < 32 ||
      !secretEqual(c.devAccessKey, data.accessKey ?? '')
    )
      throw new AuthError('Integration sign-in failed');
    session = { owner: DEV_OWNER, expires: Date.now() + 21600000 };
  } else {
    const r = await authRequest(c, 'token?grant_type=password', {
      email: data.email,
      password: data.password,
    });
    session = {
      owner: r.user.id,
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expires: Date.now() + r.expires_in * 1000,
    };
  }
  (await cookies()).set(
    cookieName,
    seal(session, c.encryptionKey),
    cookieOptions(c, 21600),
  );
  return session.owner;
}
export async function requireOwner(
  c: IntegrationConfig,
  cookieName = SESSION_COOKIE,
) {
  const jar = await cookies();
  const effectiveCookie =
    cookieName === SESSION_COOKIE && !jar.get(cookieName)
      ? 'stillform-gym-session'
      : cookieName;
  const cookie = jar.get(effectiveCookie)?.value;
  if (!cookie) throw new AuthError();
  let session: z.infer<typeof authSession>;
  try {
    session = authSession.parse(unseal(cookie, c.encryptionKey));
  } catch {
    throw new AuthError();
  }
  if (c.mode === 'dev-file') {
    if (session.owner !== DEV_OWNER || session.expires < Date.now())
      throw new AuthError();
    return session.owner;
  }
  if (session.expires < Date.now() + 60000) {
    if (!session.refreshToken) throw new AuthError();
    const r = await authRequest(c, 'token?grant_type=refresh_token', {
      refresh_token: session.refreshToken,
    });
    session = {
      owner: r.user.id,
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expires: Date.now() + r.expires_in * 1000,
    };
    (await cookies()).set(
      effectiveCookie,
      seal(session, c.encryptionKey),
      cookieOptions(c, 21600),
    );
  }
  const r = await fetch(`${c.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: c.supabaseKey,
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new AuthError();
  const user = z.object({ id: z.uuid() }).parse(await r.json());
  if (user.id !== session.owner) throw new AuthError();
  return user.id;
}
export async function logoutSession() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(STATE_COOKIE);
  (await cookies()).delete('stillform-polar-state');
  (await cookies()).delete('stillform-gym-session');
}
export async function setState(
  value: string,
  c: IntegrationConfig,
  provider: 'strava' | 'polar' = 'strava',
) {
  (await cookies()).set(
    provider === 'polar' ? 'stillform-polar-state' : STATE_COOKIE,
    value,
    cookieOptions(c, 600),
  );
}
export async function consumeState(provider: 'strava' | 'polar' = 'strava') {
  const jar = await cookies(),
    name = provider === 'polar' ? 'stillform-polar-state' : STATE_COOKIE,
    value = jar.get(name)?.value ?? '';
  jar.delete(name);
  return value;
}
