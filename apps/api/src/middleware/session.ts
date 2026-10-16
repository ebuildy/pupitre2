import type { Role } from '@pupitre/shared'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { auth, type Session } from '../auth.ts'

export type AppEnv = {
  Variables: {
    user: Session['user'] | null
    session: Session['session'] | null
  }
}

type AuthedEnv = {
  Variables: { user: Session['user']; session: Session['session'] }
}

/**
 * Resolves the better-auth session (if any) into `c.var.user` / `c.var.session`.
 * A deactivated user's existing sessions are ignored, so they are treated as signed out.
 */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  const active = result?.user.isActive ? result : null
  c.set('user', active?.user ?? null)
  c.set('session', active?.session ?? null)
  await next()
})

/** Rejects unauthenticated requests with 401 and narrows `c.var.user` to non-null. */
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  if (!c.get('user')) throw new HTTPException(401, { message: 'Authentication required' })
  await next()
})

const forbiddenMessages: Record<string, string> = {
  admin: 'Admin access required',
  manager: 'Manager access required',
  'admin,manager': 'Manager or admin access required',
}

/** 401 when signed out, 403 unless the user has one of `roles` (spec 001). */
export function requireRole(...roles: Role[]) {
  const message = forbiddenMessages[[...roles].sort().join(',')] ?? 'Access denied'
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) throw new HTTPException(401, { message: 'Authentication required' })
    if (!roles.includes(user.role as Role)) throw new HTTPException(403, { message })
    await next()
  })
}
