import 'server-only';
export const STRAVA_ENDPOINTS = {
  api: 'https://www.strava.com/api/v3',
  authorize: 'https://www.strava.com/oauth/authorize',
  token: 'https://www.strava.com/oauth/token',
  revoke: 'https://www.strava.com/oauth/revoke',
};
export interface IntegrationConfig {
  origin: string;
  mode: 'supabase' | 'dev-file';
  encryptionKey: string;
  clientId: string;
  clientSecret: string;
  apiBase: string;
  supabaseUrl: string;
  supabaseKey: string;
  serviceKey: string;
  secretKey: string;
  polarClientId: string;
  polarClientSecret: string;
  devAccessKey: string;
  webhookToken: string;
  subscriptionId: number;
}
export function integrationConfig(
  env: Record<string, string | undefined> = process.env,
): IntegrationConfig {
  const apiBase = env.STRAVA_API_BASE_URL || STRAVA_ENDPOINTS.api;
  if (![STRAVA_ENDPOINTS.api, 'https://api-v3.strava.com'].includes(apiBase))
    throw new Error('Unsupported STRAVA_API_BASE_URL');
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000').origin;
  if (
    !origin.startsWith('https://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  )
    throw new Error('APP_ORIGIN requires HTTPS outside localhost');
  const mode = env.INTEGRATION_STORAGE === 'dev-file' ? 'dev-file' : 'supabase';
  if (mode === 'dev-file' && env.NODE_ENV !== 'development')
    throw new Error('Development storage is disabled outside development');
  if (env.SUPABASE_URL) {
    const url = new URL(env.SUPABASE_URL);
    if (
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname)
    )
      throw new Error('SUPABASE_URL requires HTTPS');
  }
  return {
    origin,
    mode,
    encryptionKey: env.INTEGRATION_ENCRYPTION_KEY || '',
    clientId: env.STRAVA_CLIENT_ID || '',
    clientSecret: env.STRAVA_CLIENT_SECRET || '',
    apiBase,
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || '',
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    secretKey: env.SUPABASE_SECRET_KEY || '',
    polarClientId: env.POLAR_CLIENT_ID || '',
    polarClientSecret: env.POLAR_CLIENT_SECRET || '',
    devAccessKey: env.DEV_INTEGRATION_ACCESS_KEY || '',
    webhookToken: env.STRAVA_WEBHOOK_VERIFY_TOKEN || '',
    subscriptionId: Number(env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || 0),
  };
}
export function missingConfiguration(
  c: IntegrationConfig,
  provider: 'strava' | 'polar' | 'shared' = 'strava',
) {
  const missing: string[] = [];
  if (!/^[a-f\d]{64}$/i.test(c.encryptionKey))
    missing.push('INTEGRATION_ENCRYPTION_KEY (64 hex characters)');
  if (c.mode === 'supabase') {
    if (!c.supabaseUrl) missing.push('SUPABASE_URL');
    if (!c.supabaseKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
    if (!c.secretKey && !c.serviceKey) missing.push('SUPABASE_SECRET_KEY');
  } else if (c.devAccessKey.length < 32)
    missing.push('DEV_INTEGRATION_ACCESS_KEY (at least 32 characters)');
  if (provider === 'strava') {
    if (!c.clientId) missing.push('STRAVA_CLIENT_ID');
    if (!c.clientSecret) missing.push('STRAVA_CLIENT_SECRET');
  } else if (provider === 'polar') {
    if (!c.polarClientId) missing.push('POLAR_CLIENT_ID');
    if (!c.polarClientSecret) missing.push('POLAR_CLIENT_SECRET');
  }
  return missing;
}
