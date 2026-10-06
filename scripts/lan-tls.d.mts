import type { KeyObject, X509Certificate } from 'node:crypto';
export function validateLanCertificate(
  cert: X509Certificate,
  key: KeyObject,
  host: string,
  now?: number,
): void;
export function lanTlsArguments(args: string[], host: string): string[];
