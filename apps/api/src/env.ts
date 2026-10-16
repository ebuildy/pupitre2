import { z } from 'zod'

// Defaults -> environment variables (spec 007). Secrets must be overridden in production.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default('./data/pupitre.db'),
  /** Public origin the browser talks to (the web app, which proxies /api). */
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(32).default('dev-secret-change-me-dev-secret-change-me'),
  /** Comma-separated list of origins allowed by CORS and better-auth. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
  LOG_REQUESTS: z.stringbool().default(true),
})

export const env = schema.parse(process.env)

if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET.startsWith('dev-secret')) {
  throw new Error('BETTER_AUTH_SECRET must be set in production')
}
