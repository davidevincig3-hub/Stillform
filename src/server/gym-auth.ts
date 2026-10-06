import 'server-only';
import { AuthError, requireOwner, SESSION_COOKIE } from './integration-auth';
import { cookies } from 'next/headers';
import { integrationConfig, missingConfiguration } from './integration-config';
import { trustedRequestOrigin } from './trusted-origins';
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
export function gymConfig(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = integrationConfig(env, request);
  if (
    config.mode !== 'supabase' ||
    missingConfiguration(config, 'shared').length
  )
    throw new AuthError(
      'Account Gym requires configured Supabase authentication',
      503,
    );
  const origin = trustedRequestOrigin(request, config);
  if (!origin)
    throw new AuthError(
      'Account Gym requires HTTPS on the configured trusted origin. HTTP LAN remains local-only.',
      403,
    );
  if (request.method !== 'GET' && request.headers.get('origin') !== origin)
    throw new AuthError('Request origin is not trusted', 403);
  return { ...config, origin };
}
