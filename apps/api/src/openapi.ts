import type { OpenAPIHono } from '@hono/zod-openapi'

/** better-auth's session cookie (`__Secure-` prefixed over HTTPS). */
const SESSION_COOKIE = 'better-auth.session_token'

let document: ReturnType<OpenAPIHono['getOpenAPI31Document']> | undefined

/**
 * The OpenAPI 3.1 document of every route declared with `.openapi()`, built once. Routes need the session cookie
 * unless they say otherwise (`security: PUBLIC`). better-auth's own endpoints (`/api/auth/*`) are not in it.
 */
export function openApiDocument(app: Pick<OpenAPIHono, 'openAPIRegistry' | 'getOpenAPI31Document'>) {
  if (document) return document
  app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
    description: 'Sign in with `POST /api/auth/sign-in/username` (or e-mail, or SSO) to get the cookie.',
  })
  document = app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'pupitre API',
      version: '1.0.0',
      description:
        'The e-learning platform API. Errors are `{ "error": "<message>" }` (spec 005). `/api/admin/*` is for admins only.',
    },
    servers: [{ url: '/', description: 'This server' }],
    security: [{ session: [] }],
  })
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      if (typeof operation === 'object' && operation && 'responses' in operation) operation.operationId ??= operationId(method, path)
    }
  }
  return document
}

/** `GET /api/admin/courses/{id}/enrollments` → `getAdminCoursesByIdEnrollments`: stable names for client generators. */
function operationId(method: string, path: string) {
  const words = path
    .replace(/^\/api\//, '/')
    .split(/[/.-]/)
    .filter(Boolean)
    .flatMap((w) => (w.startsWith('{') ? ['by', w.slice(1, -1)] : [w]))
  return method + words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')
}
