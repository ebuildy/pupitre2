import { defineConfig, devices } from '@playwright/test'

// Dedicated ports and a throwaway database so e2e runs don't collide with `pnpm dev`.
const APP_PORT = 3100
const API_PORT = 3101
const baseURL = `http://localhost:${APP_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
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
        BETTER_AUTH_URL: baseURL,
        CORS_ORIGINS: baseURL,
        LOG_REQUESTS: 'false',
      },
    },
    {
      name: 'app',
      command: 'pnpm dev',
      cwd: './apps/app',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(APP_PORT),
        API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
})
