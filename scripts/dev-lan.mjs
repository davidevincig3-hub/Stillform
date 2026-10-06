import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { isPrivateIPv4 } from '../src/domain/lan-host.mjs';
export { isPrivateIPv4 } from '../src/domain/lan-host.mjs';
export function lanAddresses(interfaces) {
  return Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter(
        (e) => !e.internal && e.family === 'IPv4' && isPrivateIPv4(e.address),
      )
      .map((e) => ({ name, address: e.address })),
  );
}
export function selectLanAddress(addresses, requested) {
  if (requested) {
    if (!addresses.some((e) => e.address === requested))
      throw new Error(
        'Select a listed private IPv4 address belonging to this machine.',
      );
    return requested;
  }
  if (new Set(addresses.map((e) => e.address)).size !== 1)
    throw new Error(
      'Choose the Wi-Fi/Ethernet address shared with your phone: pnpm dev:lan --host <listed-ip> (or pnpm lan:url --host <listed-ip>).',
    );
  return addresses[0].address;
}
// Pure helpers can be tested without starting a server.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const addresses = lanAddresses(networkInterfaces());
    const https = process.argv.includes('--https');
    const protocol = https ? 'https' : 'http';
    for (const e of addresses)
      console.log(`${e.name}: ${protocol}://${e.address}:3000/gym`);
    const index = process.argv.indexOf('--host');
    if (
      index >= 0 &&
      (!process.argv[index + 1] || process.argv[index + 1].startsWith('--'))
    )
      throw new Error('--host requires a listed private IPv4 address.');
    const host = selectLanAddress(
      addresses,
      index >= 0 ? process.argv[index + 1] : process.env.STILLFORM_LAN_HOST,
    );
    console.log(
      `Phone: ${protocol}://${host}:3000/gym\nDesktop: ${protocol}://localhost:3000/gym\nPrivate trusted LAN only. Account Gym sign-in requires trusted HTTPS on the phone. Keep integrations/OAuth on their configured origin.`,
    );
    if (!process.argv.includes('--url-only')) {
      const require = createRequire(import.meta.url);
      const child = spawn(
        process.execPath,
        [
          require.resolve('next/dist/bin/next'),
          'dev',
          '--hostname',
          '0.0.0.0',
          '--port',
          '3000',
          ...(https ? ['--experimental-https'] : []),
          ...[
            '--experimental-https-key',
            '--experimental-https-cert',
            '--experimental-https-ca',
          ].flatMap((flag) => {
            const at = process.argv.indexOf(flag);
            if (at < 0) return [];
            if (
              !https ||
              !process.argv[at + 1] ||
              process.argv[at + 1].startsWith('--')
            )
              throw new Error(
                `${flag} requires --https and a certificate path`,
              );
            return [flag, process.argv[at + 1]];
          }),
        ],
        { stdio: 'inherit', env: { ...process.env, STILLFORM_LAN_HOST: host } },
      );
      child.on('exit', (code) => {
        process.exitCode = code ?? 1;
      });
      child.on('error', () => {
        console.error('Unable to start Next.js.');
        process.exitCode = 1;
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
