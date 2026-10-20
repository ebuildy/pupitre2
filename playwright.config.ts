import { defineConfig, devices } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_PORT, API_PORT, APP_PORT, BASE_URL, GITLAB_PORT, IDP_PORT, LDAP_HTTP_PORT, LDAP_PORT, OPA_PORT, PROBES_PORT } from './e2e/env.ts'

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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /global-settings\.spec\.ts/ },
    // Platform settings (spec 179) change the behaviour of every test (registration, login…): this project runs
    // alone, after the others, one test at a time. Run it on its own with `--project global-settings --no-deps`.
    {
      name: 'global-settings',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /global-settings\.spec\.ts/,
      dependencies: ['chromium'],
      fullyParallel: false,
      workers: 1,
    },
  ],
  webServer: [
    {
      name: 'idp',
      command: 'node e2e/fake-idp.mjs',
      url: `http://localhost:${IDP_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(IDP_PORT) },
    },
    {
      name: 'ldap',
      command: 'node e2e/fake-ldap.mjs',
      url: `http://localhost:${LDAP_HTTP_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(LDAP_HTTP_PORT), LDAP_PORT: String(LDAP_PORT) },
    },
    {
      name: 'gitlab',
      command: 'node e2e/fake-gitlab.mjs',
      url: `http://localhost:${GITLAB_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(GITLAB_PORT) },
    },
    {
      name: 'opa',
      command: 'node e2e/fake-opa.mjs',
      url: `http://localhost:${OPA_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(OPA_PORT) },
    },
    {
      name: 'api',
      command: 'rm -rf data/e2e.db* data/e2e-uploads && pnpm start',
      cwd: './apps/api',
      url: `http://localhost:${PROBES_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        PROBES_PORT: String(PROBES_PORT),
        DATABASE_URL: './data/e2e.db',
        UPLOADS_DIR: './data/e2e-uploads',
        GIT_CACHE_DIR: './data/e2e-git-cache',
        PATTERNS_FILE: '../../e2e/patterns.yaml',
        GITLAB_URL: `http://localhost:${GITLAB_PORT}`,
        // Spec 091: the `cli` policy engine runs this stand-in; it asks e2e/fake-opa.mjs for the verdict.
        OPA_BIN: '../../e2e/fake-opa-cli.mjs',
        FAKE_OPA_URL: `http://localhost:${OPA_PORT}`,
        // Specs 027–029: a runtime OIDC provider from OIDC_* and two deploy-time ones, all served by e2e/fake-idp.mjs.
        OIDC_ENABLED: 'true',
        OIDC_NAME: 'Fake IdP',
        OIDC_PROVIDER_URL: `http://localhost:${IDP_PORT}/.well-known/openid-configuration`,
        OIDC_CLIENT_ID: 'pupitre',
        OIDC_CLIENT_SECRET: 'e2e-secret',
        SSO_PROVIDERS_FILE: '../../e2e/sso-providers.yaml',
        // Spec 027, SSO demo: the one-click sign-in of the SSO section (password grant of e2e/fake-idp.mjs).
        SSO_DEMO_PASSWORD_GRANT: 'true',
        BETTER_AUTH_URL: BASE_URL,
        CORS_ORIGINS: BASE_URL,
        LOG_REQUESTS: 'false',
        QUERY_COUNT_HEADER: 'true',
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
        VITE_DEMO_ADMIN_PASSWORD: ADMIN_PASSWORD,
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
