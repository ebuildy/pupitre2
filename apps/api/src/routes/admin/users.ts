import {
  adminUserDetailSchema,
  adminUserSearchResultSchema,
  type AdminUserSummary,
  adminUserSummarySchema,
  adminUserUpdateSchema,
  messageSchema,
  ROLES,
  type Role,
  xpAdjustmentSchema,
} from '@pupitre/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import {
  course,
  courseCompletion,
  enrollmentGrant,
  groupMembership,
  questionAttemptState,
  session,
  user,
  userGroup,
  xpEvent,
} from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
import { audit } from '../../services/audit.ts'
import { adjustXp, xpHistory } from '../../services/xp.ts'

function likeAny(q: string | undefined) {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
  return sql`(${user.username} LIKE ${pattern} ESCAPE '\\' OR ${user.email} LIKE ${pattern} ESCAPE '\\' OR ${user.name} LIKE ${pattern} ESCAPE '\\')`
}

const USER_LIST_LIMIT = 200

// Correlated subqueries: the outer column is written qualified (Drizzle drops the table name in one-table selects).
const xpTotal = sql<number>`coalesce((SELECT sum(${xpEvent.amount}) FROM ${xpEvent} WHERE ${xpEvent.userId} = "user"."id"), 0)`.mapWith(
  Number,
)
const enrolledCount = sql<number>`(SELECT count(DISTINCT ${enrollmentGrant.courseId}) FROM ${enrollmentGrant} WHERE ${enrollmentGrant.userId} = "user"."id")`.mapWith(
  Number,
)

function summaryColumns() {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    xp: xpTotal,
    enrolledCourses: enrolledCount,
  }
}

function toSummary(r: { role: string; createdAt: Date } & Omit<AdminUserSummary, 'role' | 'createdAt'>): AdminUserSummary {
  return { ...r, role: r.role as Role, createdAt: r.createdAt.toISOString() }
}

function requireUser(id: string) {
  const found = db.select().from(user).where(eq(user.id, id)).get()
  if (!found) throw new HTTPException(404, { message: 'User not found' })
  return found
}

const listQuery = z.object({
  search: z.string().optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

const tags = ['Admin: users']

const search = createRoute({
  method: 'get',
  path: '/search',
  tags,
  summary: 'Find users',
  description: 'Spec 145 autocomplete: the first 10 users whose username, e-mail or name contains `q`.',
  request: { query: z.object({ q: z.string().trim().min(1).max(100) }) },
  responses: { 200: json(z.object({ users: z.array(adminUserSearchResultSchema) })), ...errors(400, ...ADMIN) },
})

const list = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Users',
  description: `Spec 162: the first ${USER_LIST_LIMIT} by name, with the total of matching users.`,
  request: { query: listQuery },
  responses: { 200: json(z.object({ users: z.array(adminUserSummarySchema), total: z.number() })), ...errors(400, ...ADMIN) },
})

const getOne = createRoute({
  method: 'get',
  path: '/{id}',
  tags,
  summary: 'A user',
  description: 'With XP history, completions, groups and courses.',
  request: { params: params('id') },
  responses: { 200: json(adminUserDetailSchema), ...errors(...ADMIN, 404) },
})

const update = createRoute({
  method: 'patch',
  path: '/{id}',
  tags,
  summary: 'Change role or active flag',
  description: 'Spec 163. Deactivating a user ends their sessions; an admin cannot demote or deactivate themselves (400).',
  request: { params: params('id'), body: jsonBody(adminUserUpdateSchema) },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const remove = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a user',
  description: 'Spec 163: every personal row goes with the user. An admin cannot delete themselves (400).',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const resetQuizAttempts = createRoute({
  method: 'delete',
  path: '/{id}/quiz-attempts',
  tags,
  summary: "Reset a learner's quiz attempts",
  description: 'Spec 191: cooldowns and locks of every question.',
  request: { params: params('id') },
  responses: { 200: json(z.object({ message: z.string(), count: z.number() })), ...errors(...ADMIN) },
})

const adjust = createRoute({
  method: 'post',
  path: '/{id}/xp',
  tags,
  summary: 'Adjust XP',
  description: 'Spec 191: a manual adjustment with a reason; the total cannot become negative (400).',
  request: { params: params('id'), body: jsonBody(xpAdjustmentSchema) },
  responses: { 200: json(z.object({ total: z.number() })), ...errors(400, ...ADMIN, 404) },
})

/** Users, under /api/admin/users: autocomplete (spec 145), list (162), edit / delete (163) and XP (103, 191). */
export const adminUserRoutes = createRouter()
  .openapi(search, async (c) => {
    const users = await db
      .select({ id: user.id, username: user.username, name: user.name, email: user.email })
      .from(user)
      .where(likeAny(c.req.valid('query').q))
      .orderBy(asc(user.name))
      .limit(10)
    return c.json({ users }, 200)
  })
  .openapi(list, (c) => {
    const { search, role, status } = c.req.valid('query')
    const where = and(
      likeAny(search),
      role ? eq(user.role, role) : undefined,
      status ? eq(user.isActive, status === 'active') : undefined,
    )
    const total = db.select({ n: sql<number>`count(*)` }).from(user).where(where).get()?.n ?? 0
    const rows = db.select(summaryColumns()).from(user).where(where).orderBy(asc(user.name)).limit(USER_LIST_LIMIT).all()
    return c.json({ users: rows.map(toSummary), total }, 200)
  })
  .openapi(getOne, async (c) => {
    const found = requireUser(c.req.param('id'))
    const summary = db.select(summaryColumns()).from(user).where(eq(user.id, found.id)).get()!
    const completions = db
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
      .all()
    const groups = db
      .select({ id: userGroup.id, name: userGroup.name, role: groupMembership.role, isDefault: userGroup.isDefault })
      .from(groupMembership)
      .innerJoin(userGroup, eq(userGroup.id, groupMembership.groupId))
      .where(eq(groupMembership.userId, found.id))
      .orderBy(asc(userGroup.name))
      .all()
    const courses = db
      .select({
        id: course.id,
        slug: course.slug,
        title: course.title,
        sources: sql<string>`group_concat(DISTINCT ${enrollmentGrant.source})`,
      })
      .from(enrollmentGrant)
      .innerJoin(course, eq(course.id, enrollmentGrant.courseId))
      .where(eq(enrollmentGrant.userId, found.id))
      .groupBy(course.id)
      .orderBy(asc(course.title))
      .all()
    return c.json({
      ...toSummary(summary),
      history: await xpHistory(found.id),
      completions: completions.map((r) => ({
        title: r.title,
        completedAt: r.completedAt.toISOString(),
        course: r.slug ? { slug: r.slug, title: r.currentTitle! } : null,
      })),
      groups,
      courses: courses.map((r) => ({ ...r, sources: r.sources.split(',').sort() })),
    }, 200)
  })
  // Spec 163: role and active flag. An admin cannot demote or deactivate themselves.
  .openapi(update, (c) => {
    const me = c.get('user')!
    const found = requireUser(c.req.param('id'))
    const input = c.req.valid('json')
    if (found.id === me.id && ((input.role && input.role !== 'admin') || input.isActive === false)) {
      throw new HTTPException(400, { message: 'You cannot remove your own admin access' })
    }
    db.transaction((tx) => {
      tx.update(user).set(input).where(eq(user.id, found.id)).run()
      // A deactivated user loses their open sessions at once (spec 191).
      if (input.isActive === false) tx.delete(session).where(eq(session.userId, found.id)).run()
    })
    const target = { type: 'user', id: found.id, label: found.email }
    if (input.role && input.role !== found.role) audit(me, 'user.role', target, { from: found.role, to: input.role })
    if (input.isActive !== undefined && input.isActive !== found.isActive) {
      audit(me, input.isActive ? 'user.activate' : 'user.deactivate', target)
    }
    return c.json({ message: 'User updated' }, 200)
  })
  // Spec 163 / 191: every personal row goes with the user (cascades); the audit keeps the e-mail.
  .openapi(remove, (c) => {
    const me = c.get('user')!
    const found = requireUser(c.req.param('id'))
    if (found.id === me.id) throw new HTTPException(400, { message: 'You cannot delete your own account' })
    db.delete(user).where(eq(user.id, found.id)).run()
    audit(me, 'user.delete', { type: 'user', id: found.id, label: found.email })
    return c.json({ message: 'User deleted' }, 200)
  })
  // Spec 191 "QuestionAttemptState": an admin can reset a learner's quiz attempts (cooldowns and locks).
  .openapi(resetQuizAttempts, async (c) => {
    const removed = db.delete(questionAttemptState).where(eq(questionAttemptState.userId, c.req.param('id'))).run()
    return c.json({ message: 'Quiz attempts reset', count: removed.changes }, 200)
  })
  .openapi(adjust, async (c) => {
    const found = requireUser(c.req.param('id'))
    const { amount, reason } = c.req.valid('json')
    const total = adjustXp(found.id, amount, reason, c.get('user')!.id)
    if (total === null) throw new HTTPException(400, { message: 'XP total cannot become negative' })
    return c.json({ total }, 200)
  })
