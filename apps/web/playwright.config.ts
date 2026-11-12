import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Dedicated ports + a fresh throwaway DB per run, so e2e never touches the dev database.
const API_PORT = 4100;
const WEB_PORT = 5174;
const E2E_DB = join(tmpdir(), `water-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:serve -w @water/server',
      cwd: '../..',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        DATABASE_URL: `file:${E2E_DB}`,
        PORT: String(API_PORT),
        NODE_ENV: 'test',
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite',
      url: `http://localhost:${WEB_PORT}`,
      env: { WEB_PORT: String(WEB_PORT), API_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
