import { fileURLToPath } from 'node:url'

// Dedicated ports and a throwaway database so e2e runs don't collide with `pnpm dev`.
export const APP_PORT = 3100
export const API_PORT = 3101
export const ADMIN_PORT = 3102
/** e2e/fake-gitlab.mjs (lab step checks). */
export const GITLAB_PORT = 3103
export const ADMIN_PASSWORD = 'Admin@e2e-1234'
export const BASE_URL = `http://localhost:${APP_PORT}`
export const API_DB_PATH = fileURLToPath(new URL('../apps/api/data/e2e.db', import.meta.url))
