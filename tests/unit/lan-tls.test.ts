import { expect, it, vi } from 'vitest';
import type { X509Certificate, KeyObject } from 'node:crypto';
import {
  lanTlsArguments,
  validateLanCertificate,
} from '../../scripts/lan-tls.mjs';

function certificate() {
  return {
    subject: 'leaf',
    issuer: 'local CA',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
    checkIP: vi.fn((ip: string) => ['192.168.10.20', '127.0.0.1'].includes(ip)),
    checkHost: vi.fn((host: string) =>
      host === 'localhost' ? host : undefined,
    ),
    checkPrivateKey: vi.fn(() => true),
  };
}
const key = {} as KeyObject;
const now = Date.parse('2026-10-06T00:00:00Z');
it('requires a current CA-issued certificate matching the exact LAN IP, localhost and private key', () => {
  const cert = certificate();
  expect(() =>
    validateLanCertificate(
      cert as unknown as X509Certificate,
      key,
      '192.168.10.20',
      now,
    ),
  ).not.toThrow();
  expect(cert.checkHost).toHaveBeenCalledWith('localhost', {
    subject: 'never',
  });
  expect(() =>
    validateLanCertificate(
      cert as unknown as X509Certificate,
      key,
      '192.168.10.21',
      now,
    ),
  ).toThrow('must cover');
  cert.checkPrivateKey.mockReturnValue(false);
  expect(() =>
    validateLanCertificate(
      cert as unknown as X509Certificate,
      key,
      '192.168.10.20',
      now,
    ),
  ).toThrow('do not match');
});
it('rejects expired, future and self-signed leaves without silently generating replacements', () => {
  const cert = certificate();
  const validate = (time: number) =>
    validateLanCertificate(
      cert as unknown as X509Certificate,
      key,
      '192.168.10.20',
      time,
    );
  expect(() => validate(Date.parse('2025-01-01'))).toThrow('not yet valid');
  expect(() => validate(Date.parse('2027-01-01'))).toThrow('expired');
  cert.issuer = cert.subject;
  expect(() => validate(now)).toThrow('CA-issued');
});
it('fails closed for missing files and malformed explicit certificate flags', () => {
  expect(() =>
    lanTlsArguments(['--experimental-https-cert', '--host'], '192.168.10.20'),
  ).toThrow('requires a certificate path');
  expect(() =>
    lanTlsArguments(
      [
        '--experimental-https-key',
        'missing-test-key.pem',
        '--experimental-https-cert',
        'missing-test-cert.pem',
      ],
      '192.168.10.20',
    ),
  ).toThrow('no untrusted certificate is generated');
});
