import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { auth, type Session } from '../auth.ts'

export type AppEnv = {
  Variables: {
    user: Session['user'] | null
    session: Session['session'] | null
  }
}

/** Resolves the better-auth session (if any) into `c.var.user` / `c.var.session`. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', result?.user ?? null)
  c.set('session', result?.session ?? null)
  await next()
})

/** Rejects unauthenticated requests with 401 and narrows `c.var.user` to non-null. */
export const requireAuth = createMiddleware<{
  Variables: { user: Session['user']; session: Session['session'] }
}>(async (c, next) => {
  if (!c.get('user')) throw new HTTPException(401, { message: 'Authentication required' })
  await next()
})
