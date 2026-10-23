import { defineConfig } from '@playwright/test';
import { urls } from './urls';

/**
 * Two ways to run:
 *  - Dev: `pnpm dev` in another terminal (api 3000, web 5173, mobile 8081), then `pnpm e2e`.
 *  - Production build: `pnpm build`, then `BASE_URL=http://localhost:3000 pnpm e2e`. With E2E_START_SERVER=1
 *    Playwright starts `apps/api/dist/main.js` itself (used on CI).
 * The demo has one shared database, so tests run serially.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  webServer: process.env.E2E_START_SERVER
    ? {
        command: 'node ../../apps/api/dist/main.js',
        url: `${urls.API}/`,
        reuseExistingServer: true,
        timeout: 240_000, // first start downloads the MongoDB binary
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
});
