import type { AppType } from '@pupitre/api'
import { hc } from 'hono/client'

/** Typed client for the API routes (Hono RPC). Cookies are sent automatically (same origin). */
export const api = hc<AppType>('/')
