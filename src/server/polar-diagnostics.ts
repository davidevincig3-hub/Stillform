import 'server-only';
import type { PolarDiagnostic } from '../domain/polar';

// Retain provider explanations, never request headers or unfiltered JSON payloads.
export function sanitizedPolarBody(raw: string, secrets: string[]): string {
  const sensitive =
    /authorization|token|secret|password|credential|api.?key|encryption.?key/i;
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          sensitive.test(key) ? '[REDACTED]' : clean(entry),
        ]),
      );
    return value;
  }
  let text = raw;
  try {
    text = JSON.stringify(clean(JSON.parse(raw)));
  } catch {
    text = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ');
  }
  // Redact before truncation, including values echoed in otherwise innocent fields.
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    for (const representation of new Set([
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ]))
      text = text.split(representation).join('[REDACTED]');
  return text
    .replace(/\b(Bearer|Basic)\s+[^\s"'<>,]+/gi, '$1 [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export function polarDiagnosticFamily(
  endpoint: string,
): PolarDiagnostic['family'] {
  if (endpoint.endsWith('/training-sessions/list')) return 'training';
  if (endpoint.endsWith('/sleeps')) return 'sleep';
  if (endpoint.endsWith('/nightly-recharge-results')) return 'nightly';
  if (endpoint.endsWith('/continuous-samples')) return 'continuous';
  if (endpoint.endsWith('/ppi-samples')) return 'ppi';
  if (endpoint.endsWith('/oauth/token')) return 'authentication';
  return 'context';
}
