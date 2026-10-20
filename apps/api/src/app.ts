import { swaggerUI } from '@hono/swagger-ui'
import type { ApiError } from '@pupitre/shared'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { ZodError } from 'zod'
import { auth } from './auth.ts'
import { env } from './env.ts'
import { queryCounter } from './db/index.ts'
import { metricsMiddleware } from './lib/metrics.ts'
import { createRouter, issueMessage } from './lib/openapi.ts'
import { openApiDocument } from './openapi.ts'
import { uploadsDir } from './services/media.ts'
import { serveStatic } from '@hono/node-server/serve-static'
import { sessionMiddleware } from './middleware/session.ts'
import { adminRoutes } from './routes/admin/index.ts'
import { courseRoutes, enrollmentRoutes, leaderboardRoutes, myRoutes } from './routes/courses.ts'
import { badgeRoutes, myBadgeRoutes, mySkillRoutes, skillRoutes } from './routes/gamification.ts'
import { myGroupRoutes } from './routes/groups.ts'
import { myPathRoutes, pathRoutes } from './routes/paths.ts'
import { sessionRoutes } from './routes/sessions.ts'
import { ssoRoutes } from './routes/sso.ts'
import { managerRoutes } from './routes/manager.ts'
import { meRoutes } from './routes/me.ts'
import { moduleRoutes } from './routes/modules.ts'
import { settingsRoutes, userRoutes } from './routes/users.ts'

const app = createRouter()

app.use(requestId())
if (env.QUERY_COUNT_HEADER) {
  app.use((c, next) => {
    const store = { count: 0 }
    return queryCounter.run(store, async () => {
      await next()
      c.res.headers.set('X-Query-Count', String(store.count))
    })
  })
}
if (env.LOG_REQUESTS) app.use(logger())
app.use(secureHeaders())

app.use(metricsMiddleware)

// Spec 062: uploaded and replicated media, public. Names are generated: anything else is refused.
app.use('/uploads/:filename', async (c, next) => {
  if (!/^[\w-]+(\.[\w]+)?$/.test(c.req.param('filename'))) return c.json<ApiError>({ error: 'Invalid filename' }, 400)
  await next()
})
app.use('/uploads/*', serveStatic({ root: uploadsDir, rewriteRequestPath: (p) => p.replace(/^\/uploads/, '') }))

app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Accept', 'Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 300,
  }),
  async (c, next) => {
    // Media uploads have their own (larger) limit.
    const maxSize = c.req.path === '/api/admin/media' ? env.MEDIA_MAX_BYTES : 1024 * 1024
    return bodyLimit({ maxSize, onError: (ctx) => ctx.json<ApiError>({ error: 'Request body too large' }, 413) })(c, next)
  },
)

// A deactivated user keeps their session rows, but the web app must see them as signed out.
app.get('/api/auth/get-session', async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  if (result && !result.user.isActive) return c.json(null)
  await next()
})
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.route('/api/sso', ssoRoutes)

app.use('/api/*', sessionMiddleware)

// Learner app routes. Chained so `AppType` carries their types to apps/app.
const learnerRoutes = createRouter()
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
const routes = app.route('/api', learnerRoutes)

// Admin app routes, all under /api/admin and admin-only. Typed separately (`AdminAppType`)
// so each frontend's client only sees its own endpoints.
app.route('/api/admin', adminRoutes)

// The OpenAPI document of the whole API, and Swagger UI to browse and try it (public).
app.get('/api/docs/openapi.json', (c) => c.json(openApiDocument(app)))
app.get('/api/docs/swagger', swaggerUI({ url: '/api/docs/openapi.json', title: 'pupitre API' }))

app.notFound((c) => c.json<ApiError>({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json<ApiError>({ error: err.message }, err.status)
  }
  // Documents validated inside services (course definitions, markdown imports): 400 with the first issue.
  if (err instanceof ZodError) return c.json<ApiError>({ error: issueMessage(err) }, 400)
  console.error(err)
  return c.json<ApiError>({ error: 'Internal server error' }, 500)
})

export default app
export type AppType = typeof routes
export type AdminAppType = typeof adminRoutes
