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
  /** Admin bootstrap (spec 016). `_FILE` (mounted secret) wins over the plain variable. */
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_PASSWORD_FILE: z.string().optional(),
  /**
   * Where module files (repo, ref, path) are read from (spec 064): `git` (clones), `fake` (CONTENT_SAMPLES_DIR only), or
   * `auto` — repositories found in CONTENT_SAMPLES_DIR are read from it, the others through git.
   */
  CONTENT_LOADER: z.enum(['fake', 'git', 'auto']).default('auto'),
  /** Spec 066: git cache. */
  GIT_CACHE_DIR: z.string().default('./data/git-cache'),
  GIT_CACHE_TTL_MINUTES: z.coerce.number().min(0).default(10),
  GIT_CACHE_MAX_REPOS: z.coerce.number().int().positive().default(64),
  /** YAML `credentials: [{url: "github.com/org/*", token: "…"}]`; first match wins. */
  GIT_CREDENTIALS_PATH: z.string().optional(),
  /** Token for every repository without a matching credential. */
  GIT_TOKEN: z.string().optional(),
  /** Fake loader: folder holding one sub-folder per repository (default `apps/api/content-samples`). */
  CONTENT_SAMPLES_DIR: z.string().optional(),
  /** Spec 009: credential endpoints (sign-in, sign-up) per client IP; 0 disables. */
  AUTH_RATE_LIMIT_REQUESTS: z.coerce.number().int().min(0).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  /** Header carrying the client IP, set by the reverse proxy (ingress, Vite in dev). */
  CLIENT_IP_HEADER: z.string().default('x-forwarded-for'),
  /** Comma-separated proxy addresses/CIDRs skipped when reading the client IP (default: the local Vite proxy). */
  TRUSTED_PROXIES: z
    .string()
    .default('127.0.0.1,::1')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Spec 062: uploaded and replicated media files, served at /uploads. */
  UPLOADS_DIR: z.string().default('./data/uploads'),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(512 * 1024 * 1024),
  /** Spec 015: load the mock data (`src/fixtures`) at startup. Development only. */
  SEED_DEV_DATA: z.stringbool().default(false),
})

export const env = schema.parse(process.env)

if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET.startsWith('dev-secret')) {
  throw new Error('BETTER_AUTH_SECRET must be set in production')
}
