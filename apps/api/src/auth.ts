import { ROLES } from '@pupitre/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { username } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import * as schema from './db/schema/index.ts'
import { env } from './env.ts'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      // `input: false`: never settable through sign-up or update-user (spec 001).
      role: { type: [...ROLES], required: true, defaultValue: 'student', input: false },
      isActive: { type: 'boolean', required: true, defaultValue: true, input: false },
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
  plugins: [username()],
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
