import type { NextConfig } from 'next';
import { isPrivateIPv4 } from './scripts/dev-lan.mjs';
const config: NextConfig = {
  // Launcher supplies one verified local IPv4 host; never use a wildcard origin.
  allowedDevOrigins:
    process.env.STILLFORM_LAN_HOST &&
    isPrivateIPv4(process.env.STILLFORM_LAN_HOST)
      ? [process.env.STILLFORM_LAN_HOST]
      : [],
  devIndicators: { position: 'top-right' },
  // Private input and development credentials must never enter deployment traces.
  outputFileTracingExcludes: {
    '*': [
      './local-imports/**',
      './.integration-dev/**',
      './.env*',
      './certificates/**',
    ],
  },
};
export default config;
