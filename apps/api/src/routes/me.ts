import { isImageUrl, type MeResponse, meResponseSchema, profileUpdateSchema, type Role } from '@pupitre/shared'
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Session } from '../auth.ts'
import { db } from '../db/index.ts'
import { account, user } from '../db/schema/index.ts'
import { $, createRoute, createRouter, errors, json, jsonBody } from '../lib/openapi.ts'
import { requireAuth } from '../middleware/session.ts'
import { badgeIcons } from '../services/badges.ts'
import { getSettings } from '../services/settings.ts'

function hasPassword(userId: string) {
  return !!db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential'), isNotNull(account.password)))
    .get()
}

function toMe(u: Session['user'] | typeof user.$inferSelect): MeResponse {
  return {
    id: u.id,
    username: u.username ?? null,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    image: u.image ?? null,
    bio: u.bio ?? null,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    hasPassword: hasPassword(u.id),
  }
}

const tags = ['Me']

const getMe = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'The signed-in user',
  responses: { 200: json(meResponseSchema), ...errors(401) },
})

const updateMe = createRoute({
  method: 'patch',
  path: '/',
  tags,
  summary: 'Update the profile',
  description: 'Username (when the platform allows it), display name, bio, avatar. Empty strings clear `bio` and `image`.',
  request: { body: jsonBody(profileUpdateSchema) },
  responses: { 200: json(meResponseSchema), ...errors(400, 401, 403, 409) },
})

// Spec 034. Lives at /api/me because /api/auth/* belongs to better-auth.
export const meRoutes = $(createRouter().use(requireAuth))
  .openapi(getMe, (c) => c.json(toMe(c.get('user')), 200))
  // Spec 035: username (if allowed), display name, bio, avatar. E-mail and role are not editable here.
  .openapi(updateMe, async (c) => {
    const me = c.get('user')
    const input = c.req.valid('json')
    const changes: Partial<typeof user.$inferInsert> = {}

    if (input.username !== undefined && input.username.toLowerCase() !== me.username) {
      if (!getSettings().profile_allow_username_change) {
        throw new HTTPException(403, { message: 'Username changes are not allowed.' })
      }
      const normalized = input.username.toLowerCase()
      const taken = db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(sql`lower(${user.username})`, normalized), ne(user.id, me.id)))
        .get()
      if (taken) throw new HTTPException(409, { message: 'Username already taken' })
      // Same normalization as the better-auth username plugin: stored lowercase, displayed as typed.
      changes.username = normalized
      changes.displayUsername = input.username
    }
    if (input.name !== undefined) changes.name = input.name
    if (input.bio !== undefined) changes.bio = input.bio || null
    if (input.image !== undefined) {
      // Spec 035: an emoji avatar must be the icon of a badge the user earned.
      if (input.image && !isImageUrl(input.image) && !badgeIcons(me.id).has(input.image)) {
        throw new HTTPException(400, { message: 'Avatar emoji must come from an earned badge' })
      }
      changes.image = input.image || null
    }

    const [updated] = Object.keys(changes).length
      ? await db.update(user).set(changes).where(eq(user.id, me.id)).returning()
      : await db.select().from(user).where(eq(user.id, me.id))
    return c.json(toMe(updated!), 200)
  })
