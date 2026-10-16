import { type AdminUserDetail, type AdminUserSummary, type Role, xpAdjustmentSchema } from '@pupitre/shared'
import { asc, desc, eq, sql, sum } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { course, courseCompletion, user, xpEvent } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { adjustXp, totalXp, xpHistory } from '../../services/xp.ts'

function likeAny(q: string | undefined) {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
  return sql`(${user.username} LIKE ${pattern} ESCAPE '\\' OR ${user.email} LIKE ${pattern} ESCAPE '\\' OR ${user.name} LIKE ${pattern} ESCAPE '\\')`
}

const USER_LIST_LIMIT = 200

/** Users, under /api/admin/users: autocomplete (spec 145), list and XP (specs 103, 191). */
export const adminUserRoutes = new Hono<AppEnv>()
  .get('/search', validate('query', z.object({ q: z.string().trim().min(1).max(100) })), async (c) => {
    const users = await db
      .select({ id: user.id, username: user.username, name: user.name, email: user.email })
      .from(user)
      .where(likeAny(c.req.valid('query').q))
      .orderBy(asc(user.name))
      .limit(10)
    return c.json({ users })
  })
  .get('/', validate('query', z.object({ search: z.string().optional() })), async (c) => {
    const xp = sum(xpEvent.amount).mapWith(Number)
    const rows = await db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        xp,
      })
      .from(user)
      .leftJoin(xpEvent, eq(xpEvent.userId, user.id))
      .where(likeAny(c.req.valid('query').search))
      .groupBy(user.id)
      .orderBy(asc(user.name))
      .limit(USER_LIST_LIMIT)
    const users: AdminUserSummary[] = rows.map((r) => ({ ...r, role: r.role as Role, xp: r.xp ?? 0 }))
    return c.json({ users, total: users.length })
  })
  .get('/:id', async (c) => {
    const found = await db.query.user.findFirst({ where: eq(user.id, c.req.param('id')) })
    if (!found) throw new HTTPException(404, { message: 'User not found' })
    const completions = await db
      .select({
        title: courseCompletion.courseTitle,
        completedAt: courseCompletion.completedAt,
        slug: course.slug,
        currentTitle: course.title,
      })
      .from(courseCompletion)
      .leftJoin(course, eq(course.id, courseCompletion.courseId))
      .where(eq(courseCompletion.userId, found.id))
      .orderBy(desc(courseCompletion.completedAt))
    return c.json<AdminUserDetail>({
      id: found.id,
      username: found.username ?? null,
      name: found.name,
      email: found.email,
      role: found.role as Role,
      isActive: found.isActive,
      createdAt: found.createdAt.toISOString(),
      xp: totalXp(found.id),
      history: await xpHistory(found.id),
      completions: completions.map((r) => ({
        title: r.title,
        completedAt: r.completedAt.toISOString(),
        course: r.slug ? { slug: r.slug, title: r.currentTitle! } : null,
      })),
    })
  })
  .post('/:id/xp', validate('json', xpAdjustmentSchema), async (c) => {
    const found = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.id, c.req.param('id')) })
    if (!found) throw new HTTPException(404, { message: 'User not found' })
    const { amount, reason } = c.req.valid('json')
    const total = adjustXp(found.id, amount, reason, c.get('user')!.id)
    if (total === null) throw new HTTPException(400, { message: 'XP total cannot become negative' })
    return c.json({ total })
  })
