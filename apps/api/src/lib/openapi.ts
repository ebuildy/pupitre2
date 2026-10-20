import { $, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { apiErrorSchema } from '@pupitre/shared'
import type { Env } from 'hono'
import { z, type ZodError, type ZodType } from 'zod'
import type { AppEnv } from '../middleware/session.ts'

export { $, createRoute }

/** The `{ error }` message of a validation failure (spec 005): the first issue, prefixed with its field. */
export function issueMessage(error: ZodError) {
  const issue = error.issues[0]
  const field = issue?.path.join('.')
  return issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid request'
}

/**
 * A router of documented routes (`.openapi(createRoute(…), handler)`), whose request validation answers 400
 * `{ error }`. `.use()` returns a plain Hono type: wrap the chain in `$()` to keep `.openapi()`.
 */
export function createRouter<E extends Env = AppEnv>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: issueMessage(result.error) }, 400)
    },
  })
}

/** Path parameters, all strings. */
export function params<const K extends string>(...names: K[]) {
  return z.object(Object.fromEntries(names.map((n) => [n, z.string()])) as { [P in K]: z.ZodString })
}

/** A required JSON request body. Without `required`, a request that is not JSON would skip validation. */
export function jsonBody<T extends ZodType>(schema: T) {
  return { required: true, content: { 'application/json': { schema } } } as const
}

/** A JSON response. */
export function json<T extends ZodType>(schema: T, description = 'OK') {
  return { description, content: { 'application/json': { schema } } }
}

const ERROR_DESCRIPTIONS = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  409: 'Conflict with the current state',
  429: 'Too many requests',
  500: 'Internal server error',
  502: 'An upstream service failed',
} as const
type ErrorStatus = keyof typeof ERROR_DESCRIPTIONS

/** `{ error }` responses (spec 005) for these statuses. */
export function errors<const S extends ErrorStatus[]>(...statuses: S) {
  return Object.fromEntries(statuses.map((s) => [s, json(apiErrorSchema, ERROR_DESCRIPTIONS[s])])) as {
    [K in S[number]]: ReturnType<typeof json<typeof apiErrorSchema>>
  }
}

/** Routes open to signed-out visitors override the document's default security (the session cookie). */
export const PUBLIC = [] as { [name: string]: string[] }[]

/** Statuses of every `/api/admin/*` route: signed out, or not an admin. */
export const ADMIN = [401, 403] as const
