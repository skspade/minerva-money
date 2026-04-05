import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for reproducing bugs against an already-running
 * production server on http://localhost:3001.
 *
 * Unlike playwright.config.ts, this config does NOT start any dev servers —
 * it assumes the prod build is already being served on :3001, and runs
 * only the chat-prod spec which hits the real SSE/tRPC endpoints without
 * any mocking.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /chat-(prod(-direct)?|sdk-isolation|real-mcp)\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'html',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
