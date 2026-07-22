import { defineConfig, devices, type Project } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL
  || (process.platform === 'win32' ? 'chrome' : undefined);

const chromiumProject: Project = {
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [chromiumProject],
});
