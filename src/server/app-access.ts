import 'server-only';
import { authSession } from './auth-session';
import { unseal } from './integration-security';

export function privateAppEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.APP_REQUIRE_AUTH === 'true' || env.VERCEL_ENV === 'production';
}

// Optimistic page gate only. Every personal-data API independently verifies the
// current Supabase user/owner; expired access tokens are refreshed by those routes.
export function hasAppSession(
  cookie: string | undefined,
  key: string,
  now = Date.now(),
) {
  if (!cookie) return false;
  try {
    const session = authSession.parse(unseal(cookie, key));
    return (
      !!session.accessToken &&
      (session.expires > now ||
        (!!session.refreshToken && session.expires + 21600000 > now))
    );
  } catch {
    return false;
  }
}
