import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: { position: 'top-right' },
  // Private input and development credentials must never enter deployment traces.
  outputFileTracingExcludes: {
    '*': ['./local-imports/**', './.integration-dev/**', './.env*'],
  },
};
export default config;
