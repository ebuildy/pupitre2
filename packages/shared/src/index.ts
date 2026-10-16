// Code shared between the API and the web app: wire types, zod schemas, constants.

/** Every API error is `{ error }` with a user-displayable message (spec 005). */
export type ApiError = {
  error: string
}

/** `GET /health` response (spec 006). */
export type HealthResponse = {
  status: 'ok'
}

/** Platform roles (spec 001). Every account has exactly one. */
export const ROLES = ['student', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

/** `GET /api/me` response (spec 034). */
export type MeResponse = {
  id: string
  username: string | null
  email: string
  name: string
  role: Role
  image: string | null
  isActive: boolean
  createdAt: string
}

/** Where to go after login (spec 025): a local `redirect` path, else the role's home. */
export function landingPath(role: Role | undefined, redirect: string | null | undefined): string {
  if (redirect && /^\/(?![/\\])/.test(redirect)) return redirect
  return role === 'admin' ? '/admin' : '/courses'
}

export * from './courses.ts'
export * from './xp.ts'
export * from './content.ts'
