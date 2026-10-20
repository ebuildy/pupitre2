import { publicSettingsSchema, publicUserProfileSchema, userBadgesResponseSchema } from '@pupitre/shared'
import { and, count, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { courseCompletion, user } from '../db/schema/index.ts'
import { createRoute, createRouter, errors, json, params, PUBLIC } from '../lib/openapi.ts'
import { earnedBadges } from '../services/badges.ts'
import { publicSettings } from '../services/settings.ts'
import { totalXp } from '../services/xp.ts'

/** Spec 037: public profile. Deactivated accounts are not shown. */
function activeUser(id: string) {
  const found = db
    .select()
    .from(user)
    .where(and(eq(user.id, id), eq(user.isActive, true)))
    .get()
  if (!found) throw new HTTPException(404, { message: 'User not found' })
  return found
}

const tags = ['Users']

const getUserBadges = createRoute({
  method: 'get',
  path: '/{id}/badges',
  tags,
  security: PUBLIC,
  summary: "A user's badges",
  request: { params: params('id') },
  responses: { 200: json(userBadgesResponseSchema), ...errors(404) },
})

const getUser = createRoute({
  method: 'get',
  path: '/{id}',
  tags,
  security: PUBLIC,
  summary: 'Public profile of a user',
  description: 'Spec 037: what anyone can see of a user (no e-mail). Deactivated accounts are 404.',
  request: { params: params('id') },
  responses: { 200: json(publicUserProfileSchema), ...errors(404) },
})

const getPublicSettings = createRoute({
  method: 'get',
  path: '/public',
  tags: ['Settings'],
  security: PUBLIC,
  summary: 'Settings the frontends need before sign-in',
  responses: { 200: json(publicSettingsSchema) },
})

export const userRoutes = createRouter()
  .openapi(getUserBadges, (c) => c.json({ badges: earnedBadges(activeUser(c.req.param('id')).id) }, 200))
  .openapi(getUser, async (c) => {
    const found = activeUser(c.req.param('id'))
    const completed = db
      .select({ n: count() })
      .from(courseCompletion)
      .where(eq(courseCompletion.userId, found.id))
      .get()
    return c.json({
      id: found.id,
      username: found.displayUsername ?? found.username ?? found.name,
      name: found.name,
      image: found.image,
      bio: found.bio,
      xp: totalXp(found.id),
      completedCourses: completed?.n ?? 0,
      memberSince: found.createdAt.toISOString(),
    }, 200)
  })

/** Spec 179: settings the frontends need before sign-in (registration, password policy, local login). */
export const settingsRoutes = createRouter().openapi(getPublicSettings, (c) => c.json(publicSettings(), 200))
