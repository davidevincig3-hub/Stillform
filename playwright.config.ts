import { defineConfig } from '@playwright/test';
const testUrl = 'http://localhost:3100';
export default defineConfig({
  testDir: './tests/smoke',
  use: {
    baseURL: testUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // The smoke server is intentionally unconfigured. Never inherit live account/provider secrets.
    env: {
      APP_ORIGIN: 'http://localhost:3100',
      INTEGRATION_STORAGE: 'supabase',
      INTEGRATION_ENCRYPTION_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      STRAVA_CLIENT_ID: '',
      STRAVA_CLIENT_SECRET: '',
      POLAR_CLIENT_ID: '',
      POLAR_CLIENT_SECRET: '',
      POLAR_TIME_ZONE: 'Europe/Rome',
    },
    command:
      process.env.PLAYWRIGHT_PRODUCTION === '1'
        ? 'pnpm start --port 3100'
        : 'pnpm dev --port 3100',
    url: testUrl,
    reuseExistingServer: false,
  },
});
