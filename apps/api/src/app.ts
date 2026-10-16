import type { ApiError, HealthResponse } from '@pupitre/shared'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth.ts'
import { env } from './env.ts'
import { type AppEnv, sessionMiddleware } from './middleware/session.ts'

const app = new Hono<AppEnv>()

app.use(requestId())
if (env.LOG_REQUESTS) app.use(logger())
app.use(secureHeaders())

// Spec 006: probes are public and never touch the database.
app.get('/health', (c) => c.json<HealthResponse>({ status: 'ok' }))

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

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.use('/api/*', sessionMiddleware)

// Feature routers are chained here so `AppType` carries their types to the web client.
const routes = app.basePath('/api')

app.notFound((c) => c.json<ApiError>({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json<ApiError>({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json<ApiError>({ error: 'Internal server error' }, 500)
})

export default app
export type AppType = typeof routes
