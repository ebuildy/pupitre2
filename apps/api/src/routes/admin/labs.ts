import { type AdminLabCheck, adminLabCheckSchema } from '@pupitre/shared'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { course, courseModule, labCheck, user } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json } from '../../lib/openapi.ts'

const listLabChecks = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin: labs'],
  summary: 'Lab check history',
  description: 'Specs 094, 095: the last 1000 checks, most recent first; `course`: a course id.',
  request: { query: z.object({ course: z.string().optional() }) },
  responses: { 200: json(z.object({ checks: z.array(adminLabCheckSchema) })), ...errors(400, ...ADMIN) },
})

/** Spec 094/095: lab check history, most recent first (`?course=<id>`). */
export const adminLabRoutes = createRouter().openapi(listLabChecks, (c) => {
  const courseId = c.req.valid('query').course
  const rows = db
    .select({
      check: labCheck,
      user: { id: user.id, username: user.username, name: user.name, email: user.email },
      module: { name: courseModule.name },
      course: { id: course.id, slug: course.slug, title: course.title },
    })
    .from(labCheck)
    .innerJoin(courseModule, eq(courseModule.id, labCheck.moduleId))
    .innerJoin(course, eq(course.id, courseModule.courseId))
    .leftJoin(user, eq(user.id, labCheck.userId))
    .where(and(courseId ? eq(course.id, courseId) : undefined))
    .orderBy(desc(labCheck.checkedAt))
    .limit(1000)
    .all()
  const checks: AdminLabCheck[] = rows.map((r) => ({
    id: r.check.id,
    user: r.user?.id ? { id: r.user.id, username: r.user.username ?? r.user.name, email: r.user.email } : null,
    userEmail: r.check.userEmail,
    course: r.course,
    module: r.module.name,
    step: r.check.stepTitle,
    allow: r.check.allow,
    violations: r.check.violations,
    verified: r.check.verified,
    checkedAt: r.check.checkedAt.toISOString(),
  }))
  return c.json({ checks }, 200)
})
