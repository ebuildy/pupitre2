import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { auth } from '../auth.ts'
import { db } from '../db/index.ts'
import { user } from '../db/schema/index.ts'
import { env } from '../env.ts'

const ADMIN_EMAIL = 'admin@pupitre.local'
const ADMIN_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'Admin@1234'

function configuredPassword(): string | undefined {
  if (env.ADMIN_PASSWORD_FILE) return readFileSync(env.ADMIN_PASSWORD_FILE, 'utf8').trim() || undefined
  return env.ADMIN_PASSWORD || undefined
}

/**
 * Spec 016: ensure the `admin` account exists. A configured password is (re)applied at every start
 * (rotation by restart); without one the default is used, and only when the account is created.
 */
export async function ensureAdmin() {
  const ctx = await auth.$context
  const configured = configuredPassword()

  const existing = await db.query.user.findFirst({ where: eq(user.email, ADMIN_EMAIL) })

  if (!existing) {
    if (!configured) {
      console.warn(
        `⚠️  No ADMIN_PASSWORD configured: creating ${ADMIN_EMAIL} with the default password. Change it before going to production.`,
      )
    }
    const created = await ctx.internalAdapter.createUser(
      {
        email: ADMIN_EMAIL,
        name: ADMIN_USERNAME,
        username: ADMIN_USERNAME,
        displayUsername: ADMIN_USERNAME,
        emailVerified: true,
        role: 'admin',
        isActive: true,
      },
      { method: 'admin' },
    )
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      password: await ctx.password.hash(configured ?? DEFAULT_PASSWORD),
    })
    return
  }

  if (existing.role !== 'admin' || !existing.isActive) {
    await db.update(user).set({ role: 'admin', isActive: true }).where(eq(user.id, existing.id))
  }
  if (configured) {
    await ctx.internalAdapter.updatePassword(existing.id, await ctx.password.hash(configured))
  }
}
