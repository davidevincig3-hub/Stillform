import 'server-only';
import { isPrivateIPv4 } from '../domain/lan-host.mjs';
import { AuthError, requireOwner, SESSION_COOKIE } from './integration-auth';
import { cookies } from 'next/headers';
import { integrationConfig, missingConfiguration } from './integration-config';
export const GYM_SESSION_COOKIE = 'stillform-gym-session';
export async function requireGymOwner(
  config: ReturnType<typeof integrationConfig>,
) {
  const jar = await cookies();
  return requireOwner(
    config,
    jar.get(GYM_SESSION_COOKIE) ? GYM_SESSION_COOKIE : SESSION_COOKIE,
  );
}
// Integration/OAuth origins remain unchanged. Gym additionally supports one explicit HTTPS development LAN origin.
export function gymConfig(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = integrationConfig(env);
  if (
    config.mode !== 'supabase' ||
    missingConfiguration(config, 'shared').length
  )
    throw new AuthError(
      'Account Gym requires configured Supabase authentication',
      503,
    );
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  const trustedLan =
    env.NODE_ENV === 'development' &&
    url.protocol === 'https:' &&
    url.hostname === env.STILLFORM_LAN_HOST &&
    isPrivateIPv4(url.hostname) &&
    url.port === '3000';
  if (!loopback && !trustedLan && url.origin !== config.origin)
    throw new AuthError(
      'Account Gym requires HTTPS on the configured trusted origin. HTTP LAN remains local-only.',
      403,
    );
  if (!loopback && url.protocol !== 'https:')
    throw new AuthError('Account Gym requires HTTPS', 403);
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin)
    throw new AuthError('Request origin is not trusted', 403);
  // Secure cookie for HTTPS LAN, same verified Supabase owner as localhost; no secrets returned.
  return { ...config, origin: url.origin };
}
