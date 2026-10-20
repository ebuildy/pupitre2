// Code shared between the API and the web app: wire types, zod schemas, constants.
import { z } from 'zod'
import { ROLES, type Role } from './common.ts'

/** `GET /health` response (spec 006). */
export const healthResponseSchema = z.object({ status: z.literal('ok') }).meta({ id: 'Health' })
export type HealthResponse = z.infer<typeof healthResponseSchema>

/** `GET /api/me` response (spec 034). */
export const meResponseSchema = z
  .object({
    id: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    name: z.string(),
    role: z.enum(ROLES),
    image: z.string().nullable(),
    bio: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string(),
    /** The account has a local password (SSO-only accounts have none; spec 036). */
    hasPassword: z.boolean(),
  })
  .meta({ id: 'Me' })
export type MeResponse = z.infer<typeof meResponseSchema>

const PLACEHOLDER_ORIGIN = 'http://pupitre.invalid'
/** WHATWG `URL`, present in browsers and Node; this package is compiled without DOM or Node types. */
const WhatwgUrl = (globalThis as unknown as { URL: new (url: string, base: string) => { origin: string; pathname: string; search: string; hash: string } }).URL

/**
 * A `redirect` parameter as a path of this site, or null (spec 025). Browsers drop tabs and newlines from URLs and read
 * `\` as `/`, so `/\t/evil.com` would become `//evil.com`: control characters and backslashes are refused outright, then
 * the value must resolve to the same origin. Returns the normalised `pathname + search + hash`.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/')) return null
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null
  let url
  try {
    url = new WhatwgUrl(value, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }
  // Dot segments can rebuild a scheme-relative path: `/..//evil.com` normalises to `//evil.com`.
  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname.startsWith('//')) return null
  return url.pathname + url.search + url.hash
}

/** Where to go after login (spec 025): a local `redirect` path, else the role's home. */
export function landingPath(role: Role | undefined, redirect: string | null | undefined): string {
  return safeRedirectPath(redirect) ?? (role === 'admin' ? '/admin' : '/courses')
}

export * from './common.ts'
export * from './courses.ts'
export * from './xp.ts'
export * from './content.ts'
export * from './settings.ts'
export * from './account.ts'
export * from './groups.ts'
export * from './gamification.ts'
export * from './paths.ts'
export * from './sessions.ts'
export * from './definition.ts'
export * from './exports.ts'
export * from './patterns.ts'
export * from './labs.ts'
