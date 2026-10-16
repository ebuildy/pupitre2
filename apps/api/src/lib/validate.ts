import type { ApiError } from '@pupitre/shared'
import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'

/** `zValidator` answering 400 with the `{ error }` envelope (spec 005): the first issue's message. */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue?.path.join('.')
      const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid request'
      return c.json<ApiError>({ error: message }, 400)
    }
  })
}
