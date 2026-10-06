import { X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Validate identity before launching; browser/OS trust must still be installed separately.
export function validateLanCertificate(cert, key, host, now = Date.now()) {
  if (cert.subject === cert.issuer)
    throw new Error(
      'Use a local CA-issued certificate, not a self-signed leaf. See docs/MOBILE_GYM.md.',
    );
  if (!(Date.parse(cert.validFrom) <= now && now < Date.parse(cert.validTo)))
    throw new Error(
      'LAN certificate is expired or not yet valid. Regenerate it.',
    );
  if (
    !cert.checkIP(host) ||
    !cert.checkIP('127.0.0.1') ||
    !cert.checkHost('localhost', { subject: 'never' })
  )
    throw new Error(
      'LAN certificate must cover the selected IP, 127.0.0.1 and localhost. Regenerate it after an IP change.',
    );
  if (!cert.checkPrivateKey(key))
    throw new Error('LAN certificate and private key do not match.');
}

export function lanTlsArguments(args, host) {
  const value = (flag, fallback) => {
    const at = args.indexOf(flag);
    if (at < 0) return fallback;
    if (!args[at + 1] || args[at + 1].startsWith('--'))
      throw new Error(`${flag} requires a certificate path.`);
    return args[at + 1];
  };
  const certPath = value(
    '--experimental-https-cert',
    'certificates/stillform.pem',
  );
  const keyPath = value(
    '--experimental-https-key',
    'certificates/stillform-key.pem',
  );
  const caPath = value('--experimental-https-ca', undefined);
  let cert, key;
  try {
    cert = new X509Certificate(readFileSync(certPath));
    key = createPrivateKey(readFileSync(keyPath));
    if (caPath) readFileSync(caPath);
  } catch {
    throw new Error(
      'Missing or unreadable LAN certificate/key. Follow mkcert setup in docs/MOBILE_GYM.md; no untrusted certificate is generated automatically.',
    );
  }
  validateLanCertificate(cert, key, host);
  return [
    '--experimental-https',
    '--experimental-https-cert',
    certPath,
    '--experimental-https-key',
    keyPath,
    ...(caPath ? ['--experimental-https-ca', caPath] : []),
  ];
}
