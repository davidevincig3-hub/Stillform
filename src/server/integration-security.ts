import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
export function seal(value: unknown, key: string): string {
  if (!/^[a-f\d]{64}$/i.test(key))
    throw new Error('Encryption key configuration required');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((b) => b.toString('base64url'))
    .join('.');
}
export function unseal<T>(value: string, key: string): T {
  const [iv, tag, body] = value
    .split('.')
    .map((s) => Buffer.from(s, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8'),
  ) as T;
}
export function secretEqual(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
export function fingerprint(value: unknown): string {
  function stable(v: unknown): unknown {
    return Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : v;
  }
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}
export interface OAuthState {
  nonce: string;
  owner: string;
  expires: number;
}
export function newOAuthState(owner: string, key: string, now = Date.now()) {
  const state: OAuthState = {
    nonce: randomBytes(32).toString('base64url'),
    owner,
    expires: now + 600000,
  };
  return { nonce: state.nonce, cookie: seal(state, key) };
}
export function validateOAuthState(
  nonce: string,
  cookie: string,
  owner: string,
  key: string,
  now = Date.now(),
) {
  const state = unseal<OAuthState>(cookie, key);
  if (
    state.owner !== owner ||
    state.expires < now ||
    !nonce ||
    !secretEqual(state.nonce, nonce)
  )
    throw new Error('Invalid or expired OAuth state');
  return state;
}
