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
    command:
      process.env.PLAYWRIGHT_PRODUCTION === '1'
        ? 'pnpm start --port 3100'
        : 'pnpm dev --port 3100',
    url: testUrl,
    reuseExistingServer: false,
  },
});
