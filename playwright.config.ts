import { defineConfig, devices } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_PORT, API_PORT, APP_PORT, BASE_URL } from './e2e/env.ts'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'rm -f data/e2e.db* && pnpm start',
      cwd: './apps/api',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: './data/e2e.db',
        BETTER_AUTH_URL: BASE_URL,
        CORS_ORIGINS: BASE_URL,
        LOG_REQUESTS: 'false',
        ADMIN_PASSWORD,
      },
    },
    {
      name: 'app',
      command: 'pnpm dev',
      cwd: './apps/app',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(APP_PORT),
        API_URL: `http://localhost:${API_PORT}`,
        ADMIN_URL: `http://localhost:${ADMIN_PORT}`,
      },
    },
    {
      name: 'admin',
      command: 'pnpm dev',
      cwd: './apps/admin',
      url: `http://localhost:${ADMIN_PORT}/admin/`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(ADMIN_PORT),
        API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
})
