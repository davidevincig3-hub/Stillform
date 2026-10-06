import 'server-only';
import { isPrivateIPv4 } from '../domain/lan-host.mjs';

export function parseTrustedOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new Error(
      'Trusted origins must be exact origins without credentials, paths or wildcards',
    );
  if (
    url.hostname.includes('*') ||
    (url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Trusted origins require HTTPS outside loopback');
  return url.origin;
}

export function configuredOrigins(
  env: Record<string, string | undefined>,
  canonical: string,
) {
  const origins = [
    canonical,
    ...(env.APP_TRUSTED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseTrustedOrigin),
  ];
  if (env.NODE_ENV === 'development') {
    origins.push(
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://localhost:3000',
      'https://127.0.0.1:3000',
    );
    if (env.STILLFORM_LAN_HOST && isPrivateIPv4(env.STILLFORM_LAN_HOST))
      origins.push(`https://${env.STILLFORM_LAN_HOST}:3000`);
  }
  return [...new Set(origins)];
}

export function trustedRequestOrigin(
  request: Request,
  config: { origin: string; trustedOrigins?: string[]; development?: boolean },
) {
  const url = new URL(request.url);
  const allowed = config.trustedOrigins ?? [config.origin];
  if (
    config.development &&
    url.port === '3000' &&
    ['0.0.0.0', '127.0.0.1', 'localhost'].includes(url.hostname)
  ) {
    const host = request.headers.get('host');
    if (host && allowed.includes(`${url.protocol}//${host}`)) url.host = host;
  }
  return allowed.includes(url.origin) ? url.origin : null;
}
