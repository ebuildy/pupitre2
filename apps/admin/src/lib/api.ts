import type { AdminAppType } from '@pupitre/api'
import { hc } from 'hono/client'

/**
 * Typed client for the admin API (Hono RPC): every call goes to /api/admin/*, never to the
 * learner endpoints. Cookies are sent automatically (same origin). Auth calls go through
 * `authClient` from @pupitre/auth-ui.
 */
export const adminApi = hc<AdminAppType>('/api/admin')
