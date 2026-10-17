import {
  emailDomainAllowed,
  PASSWORD_RULE_MESSAGES,
  passwordChecks,
  ROLES,
  USERNAME_MAX,
  USERNAME_MIN,
} from '@pupitre/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { username } from 'better-auth/plugins'
import { eq, or, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import * as schema from './db/schema/index.ts'
import { env } from './env.ts'
import { getSettings } from './services/settings.ts'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: {
    enabled: true,
    // The password policy is a platform setting (spec 022), checked in `hooks.before`.
    minPasswordLength: 1,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      // `input: false`: never settable through sign-up or update-user (spec 001).
      role: { type: [...ROLES], required: true, defaultValue: 'student', input: false },
      isActive: { type: 'boolean', required: true, defaultValue: true, input: false },
      bio: { type: 'string', required: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Runs after the password check: a deactivated account gets the same answer as a bad password (spec 023).
        before: async (session) => {
          const user = await db.query.user.findFirst({
            columns: { isActive: true },
            where: eq(schema.user.id, session.userId),
          })
          if (!user?.isActive) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid email or password',
              code: 'INVALID_EMAIL_OR_PASSWORD',
            })
          }
        },
      },
    },
  },
  // Spec 009: per client IP. Other endpoints get a generous limit; sessions are read without going through it.
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT_REQUESTS > 0,
    window: 60,
    max: 600,
    customRules: Object.fromEntries(
      ['/sign-in/*', '/sign-up/*', '/change-password'].map((path) => [
        path,
        { window: env.AUTH_RATE_LIMIT_WINDOW_SECONDS, max: env.AUTH_RATE_LIMIT_REQUESTS },
      ]),
    ),
  },
  advanced: { ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER], trustedProxies: env.TRUSTED_PROXIES } },
  hooks: { before: createAuthMiddleware(async (ctx) => policyGuard(ctx.path, ctx.body)) },
  plugins: [username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX })],
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session

function reject(status: 'BAD_REQUEST' | 'FORBIDDEN', message: string): never {
  throw new APIError(status, { message })
}

function checkPassword(password: unknown) {
  if (typeof password !== 'string') return
  const failed = passwordChecks(password, getSettings()).find((c) => !c.ok)
  if (failed) reject('BAD_REQUEST', PASSWORD_RULE_MESSAGES[failed.rule](failed.min ?? 0))
}

/**
 * Platform policies on better-auth endpoints: registration (specs 020, 021), password policy (022),
 * local login toggle (024) and username changes (035).
 */
async function policyGuard(path: string, body: Record<string, unknown> | undefined) {
  const settings = getSettings()
  switch (path) {
    case '/sign-up/email': {
      if (!settings.registration_enabled) reject('FORBIDDEN', 'New user registration is currently disabled.')
      if (!emailDomainAllowed(String(body?.email ?? ''), settings.registration_email_whitelist)) {
        reject('FORBIDDEN', 'Registration is restricted to specific email domains.')
      }
      if (typeof body?.username !== 'string' || body.username.trim().length < USERNAME_MIN) {
        reject('BAD_REQUEST', `Username must be at least ${USERNAME_MIN} characters`)
      }
      checkPassword(body?.password)
      return
    }
    case '/change-password':
      return checkPassword(body?.newPassword)
    case '/sign-in/email':
    case '/sign-in/username': {
      if (settings.sso_local_login_enabled) return
      // SSO-only mode still lets admins in with their local password: otherwise a misconfigured identity
      // provider would lock everyone out of the settings page.
      const identifier = String(body?.email ?? body?.username ?? '').toLowerCase()
      const found = await db.query.user.findFirst({
        columns: { role: true },
        where: or(eq(sql`lower(${schema.user.email})`, identifier), eq(schema.user.username, identifier)),
      })
      if (found?.role !== 'admin') reject('FORBIDDEN', 'Local login is disabled. Please sign in with SSO.')
      return
    }
    case '/update-user': {
      if (body && ('username' in body || 'displayUsername' in body) && !settings.profile_allow_username_change) {
        reject('FORBIDDEN', 'Username changes are not allowed.')
      }
      return
    }
  }
}
