import type { ApiError, HealthResponse } from '@pupitre/shared'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { ZodError } from 'zod'
import { auth } from './auth.ts'
import { env } from './env.ts'
import { sqlite } from './db/index.ts'
import { metricsMiddleware, renderMetrics } from './lib/metrics.ts'
import { type AppEnv, sessionMiddleware } from './middleware/session.ts'
import { adminRoutes } from './routes/admin/index.ts'
import { courseRoutes, enrollmentRoutes, leaderboardRoutes, myRoutes } from './routes/courses.ts'
import { badgeRoutes, myBadgeRoutes, mySkillRoutes, skillRoutes } from './routes/gamification.ts'
import { myGroupRoutes } from './routes/groups.ts'
import { myPathRoutes, pathRoutes } from './routes/paths.ts'
import { sessionRoutes } from './routes/sessions.ts'
import { managerRoutes } from './routes/manager.ts'
import { meRoutes } from './routes/me.ts'
import { moduleRoutes } from './routes/modules.ts'
import { settingsRoutes, userRoutes } from './routes/users.ts'

const app = new Hono<AppEnv>()

app.use(requestId())
if (env.LOG_REQUESTS) app.use(logger())
app.use(secureHeaders())

app.use(metricsMiddleware)

// Spec 006: the liveness probe never touches the database; readiness checks it; metrics for Prometheus.
app.get('/health', (c) => c.json<HealthResponse>({ status: 'ok' }))
app.get('/ready', (c) => {
  try {
    sqlite.prepare('SELECT 1').get()
    return c.json({ status: 'ok' })
  } catch {
    return c.json({ status: 'unavailable' }, 503)
  }
})
app.get('/metrics', (c) => c.body(renderMetrics(), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }))

app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Accept', 'Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 300,
  }),
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json<ApiError>({ error: 'Request body too large' }, 413),
  }),
)

// A deactivated user keeps their session rows, but the web app must see them as signed out.
app.get('/api/auth/get-session', async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  if (result && !result.user.isActive) return c.json(null)
  await next()
})
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.use('/api/*', sessionMiddleware)

// Learner app routes. Chained so `AppType` carries their types to apps/app.
const routes = app
  .basePath('/api')
  .route('/me', meRoutes)
  .route('/courses', courseRoutes)
  .route('/courses/:slug/modules', moduleRoutes)
  .route('/enrollments', enrollmentRoutes)
  .route('/my', myRoutes)
  .route('/my/groups', myGroupRoutes)
  .route('/my/badges', myBadgeRoutes)
  .route('/my/skills', mySkillRoutes)
  .route('/skills', skillRoutes)
  .route('/badges', badgeRoutes)
  .route('/paths', pathRoutes)
  .route('/my/paths', myPathRoutes)
  .route('/sessions', sessionRoutes)
  .route('/manager', managerRoutes)
  .route('/leaderboard', leaderboardRoutes)
  .route('/users', userRoutes)
  .route('/settings', settingsRoutes)

// Admin app routes, all under /api/admin and admin-only. Typed separately (`AdminAppType`)
// so each frontend's client only sees its own endpoints.
app.route('/api/admin', adminRoutes)

app.notFound((c) => c.json<ApiError>({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json<ApiError>({ error: err.message }, err.status)
  }
  // Documents validated inside services (course definitions, markdown imports): 400 with the first issue.
  if (err instanceof ZodError) {
    const issue = err.issues[0]
    const field = issue?.path.join('.')
    return c.json<ApiError>({ error: issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid request' }, 400)
  }
  console.error(err)
  return c.json<ApiError>({ error: 'Internal server error' }, 500)
})

export default app
export type AppType = typeof routes
export type AdminAppType = typeof adminRoutes
