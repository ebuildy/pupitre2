import type { PublicSettings, PublicUserProfile, UserBadgesResponse } from '@pupitre/shared'
import { and, count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { courseCompletion, user } from '../db/schema/index.ts'
import type { AppEnv } from '../middleware/session.ts'
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

export const userRoutes = new Hono<AppEnv>()
  .get('/:id/badges', (c) => c.json<UserBadgesResponse>({ badges: earnedBadges(activeUser(c.req.param('id')).id) }))
  .get('/:id', async (c) => {
    const found = activeUser(c.req.param('id'))
    const completed = db
      .select({ n: count() })
      .from(courseCompletion)
      .where(eq(courseCompletion.userId, found.id))
      .get()
    return c.json<PublicUserProfile>({
      id: found.id,
      username: found.displayUsername ?? found.username ?? found.name,
      name: found.name,
      image: found.image,
      bio: found.bio,
      xp: totalXp(found.id),
      completedCourses: completed?.n ?? 0,
      memberSince: found.createdAt.toISOString(),
    })
  })

/** Spec 179: settings the frontends need before sign-in (registration, password policy, local login). */
export const settingsRoutes = new Hono<AppEnv>().get('/public', (c) => c.json<PublicSettings>(publicSettings()))
