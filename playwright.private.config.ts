import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/private-smoke',
  use: { baseURL: 'http://localhost:3101' },
  webServer: {
    command: 'pnpm start --port 3101',
    url: 'http://localhost:3101/login',
    reuseExistingServer: false,
    env: {
      APP_ORIGIN: 'http://localhost:3101',
      APP_TRUSTED_ORIGINS: '',
      APP_REQUIRE_AUTH: 'true',
      VERCEL_ENV: '',
      INTEGRATION_STORAGE: 'supabase',
      INTEGRATION_ENCRYPTION_KEY: 'ab'.repeat(32),
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      POLAR_CLIENT_ID: '',
      POLAR_CLIENT_SECRET: '',
      STRAVA_CLIENT_ID: '',
      STRAVA_CLIENT_SECRET: '',
    },
  },
});
