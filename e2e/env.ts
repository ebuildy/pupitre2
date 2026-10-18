import { fileURLToPath } from 'node:url'

// Dedicated ports and a throwaway database so e2e runs don't collide with `pnpm dev`.
export const APP_PORT = 3100
export const API_PORT = 3101
export const ADMIN_PORT = 3102
/** e2e/fake-gitlab.mjs (lab step checks). */
export const GITLAB_PORT = 3103
/** e2e/fake-idp.mjs (SSO). */
export const IDP_PORT = 3104
/** e2e/fake-ldap.mjs: the directory, and its control port. */
export const LDAP_PORT = 3389
export const LDAP_HTTP_PORT = 3105
/** e2e/fake-opa.mjs (spec 091 policy checks). */
export const OPA_PORT = 3106
export const ADMIN_PASSWORD = 'Admin@e2e-1234'
export const BASE_URL = `http://localhost:${APP_PORT}`
export const API_DB_PATH = fileURLToPath(new URL('../apps/api/data/e2e.db', import.meta.url))
