import {
  type AdminCourse,
  type AdminCourseEnrollment,
  courseCreateSchema,
  courseModulesSchema,
  courseSpecSchema,
  MARKDOWN_SPLITS,
  courseUpdateSchema,
  SLUG_PATTERN,
  type EnrollmentSource,
} from '@pupitre/shared'
import { and, asc, eq, max, min, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { course, courseCompletion, enrollmentGrant, groupCourseEnrollment, groupMembership, user, userGroup } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import {
  countEnrolled,
  findCourseById,
  grant,
  listAdminCourses,
  revoke,
  toAdminCourse,
} from '../../services/courses.ts'
import { CategoryTree } from '../../services/categories.ts'
import { adminModules, replaceModules } from '../../services/modules-admin.ts'
import { adminPrerequisites, setPrerequisites } from '../../services/prerequisites.ts'
import { audit } from '../../services/audit.ts'
import { readDefinition, writeDefinition } from '../../services/definition.ts'
import { exportMarkdownCourse } from '../../content/markdown-course.ts'
import { completeCourse, uncompleteCourse } from '../../services/xp.ts'

const NOT_FOUND = 'Course not found'
const SLUG_TAKEN = 'Course already exists'

function isUniqueViolation(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: course\.slug/.test(String(err.cause ?? err.message))
}

/** 400 when `categoryId` is given and unknown. */
function checkCategory(tree: CategoryTree, categoryId: string | null | undefined) {
  if (categoryId && !tree.byId.has(categoryId)) throw new HTTPException(400, { message: 'Unknown category' })
}

/** Form fields → columns: the badge is stored as two columns. */
function courseValues<T extends { badge?: { name: string; icon: string } | null; prerequisites?: unknown }>({
  badge,
  prerequisites: _,
  ...rest
}: T) {
  return { ...rest, ...(badge !== undefined ? { badgeName: badge?.name ?? null, badgeIcon: badge?.icon ?? null } : {}) }
}

async function requireCourse(id: string) {
  const found = await findCourseById(id)
  if (!found) throw new HTTPException(404, { message: NOT_FOUND })
  return found
}

/** Specs 165–168 (course CRUD) and 145 (course enrollments), under /api/admin/courses. */
export const adminCourseRoutes = new Hono<AppEnv>()
  .get('/', validate('query', z.object({ search: z.string().optional() })), async (c) => {
    const rows = await listAdminCourses(c.req.valid('query').search)
    const tree = await CategoryTree.load()
    return c.json<{ courses: AdminCourse[]; total: number }>({
      courses: rows.map((r) => toAdminCourse(r.course, r.enrollmentCount, tree)),
      total: rows.length,
    })
  })
  .post('/', validate('json', courseCreateSchema), async (c) => {
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkCategory(tree, input.categoryId)
    try {
      const created = db.transaction((tx) => {
        const row = tx.insert(course).values(courseValues(input)).returning().get()!
        if (input.prerequisites) setPrerequisites(tx, row.id, input.prerequisites)
        return row
      })
      return c.json<AdminCourse>(toAdminCourse(created, 0, tree, adminPrerequisites(created.id)), 201)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .get('/:id', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json<AdminCourse>(
      toAdminCourse(found, await countEnrolled(found.id), await CategoryTree.load(), adminPrerequisites(found.id)),
    )
  })
  .patch('/:id', validate('json', courseUpdateSchema), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkCategory(tree, input.categoryId)
    try {
      const updated = db.transaction((tx) => {
        const values = courseValues(input)
        const row = Object.keys(values).length
          ? tx.update(course).set(values).where(eq(course.id, found.id)).returning().get()!
          : found
        if (input.prerequisites) setPrerequisites(tx, found.id, input.prerequisites)
        return row
      })
      return c.json<AdminCourse>(toAdminCourse(updated, await countEnrolled(found.id), tree, adminPrerequisites(found.id)))
    } catch (err) {
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .delete('/:id', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    // Enrollment grants cascade.
    await db.delete(course).where(eq(course.id, found.id))
    return c.json({ message: 'Course deleted' })
  })

  // Spec 145
  .get('/:id/enrollments', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const rows = await db
      .select({
        userId: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        enrolledAt: min(enrollmentGrant.createdAt).mapWith(Number),
        sources: sql<string>`group_concat(DISTINCT ${enrollmentGrant.source})`,
        completedAt: max(courseCompletion.completedAt).mapWith(Number),
      })
      .from(enrollmentGrant)
      .innerJoin(user, eq(user.id, enrollmentGrant.userId))
      .leftJoin(
        courseCompletion,
        and(eq(courseCompletion.userId, enrollmentGrant.userId), eq(courseCompletion.courseId, found.id)),
      )
      .where(eq(enrollmentGrant.courseId, found.id))
      .groupBy(user.id)
      .orderBy(asc(user.name))

    const enrollments: AdminCourseEnrollment[] = rows.map((r) => ({
      ...r,
      enrolledAt: new Date(r.enrolledAt).toISOString(),
      sources: r.sources.split(',').sort() as EnrollmentSource[],
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    }))
    return c.json({ enrollments, total: enrollments.length })
  })
  .post('/:id/enrollments', validate('json', z.object({ userId: z.string().min(1) })), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { userId } = c.req.valid('json')
    const target = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.id, userId) })
    if (!target) throw new HTTPException(404, { message: 'User not found' })

    // Admins can enroll in any course, private or not (spec 145).
    await grant(target.id, found.id, 'admin', c.get('user')!.id)
    return c.json({ message: 'User enrolled' })
  })
  .delete('/:id/enrollments/:userId', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    // Removes the direct grants (the learner's own, automatic, admin and manager ones). Group/path grants stay.
    await revoke(c.req.param('userId'), found.id, ['self', 'auto', 'admin', 'manager'])
    return c.json({ message: 'User unenrolled' })
  })

  // Spec 135: groups enrolled in the course (enroll / withdraw: /api/admin/groups/:id/courses).
  .get('/:id/groups', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const memberCount = sql<number>`(SELECT count(*) FROM ${groupMembership} WHERE ${groupMembership.groupId} = ${userGroup.id})`.mapWith(Number)
    const groups = db
      .select({ id: userGroup.id, name: userGroup.name, memberCount, enrolledAt: groupCourseEnrollment.createdAt })
      .from(groupCourseEnrollment)
      .innerJoin(userGroup, eq(userGroup.id, groupCourseEnrollment.groupId))
      .where(eq(groupCourseEnrollment.courseId, found.id))
      .orderBy(asc(userGroup.name))
      .all()
      .map((g) => ({ ...g, enrolledAt: g.enrolledAt.toISOString() }))
    return c.json({ groups })
  })

  // Spec 176: markdown export.
  .get(
    '/:id/export/markdown',
    validate('query', z.object({ split: z.enum(MARKDOWN_SPLITS).optional() })),
    async (c) => {
      const found = await requireCourse(c.req.param('id'))
      const { slug, spec } = await readDefinition(found)
      const markdown = exportMarkdownCourse(slug, spec, c.req.valid('query').split)
      c.header('Content-Disposition', `attachment; filename="${slug}.md"`)
      c.header('X-Content-Type-Options', 'nosniff')
      return c.body(markdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
    },
  )

  // Spec 169: the whole course as a portable document.
  .get('/:id/definition', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json(await readDefinition(found))
  })
  .put('/:id/definition', validate('json', z.object({ slug: z.string().optional(), spec: courseSpecSchema })), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { slug, spec } = c.req.valid('json')
    if (slug !== undefined && !SLUG_PATTERN.test(slug)) throw new HTTPException(400, { message: 'Invalid slug' })
    writeDefinition(slug ?? found.slug, spec, found)
    audit(c.get('user'), 'course.definition', { type: 'course', id: found.id, label: slug ?? found.slug })
    return c.json(await readDefinition((await findCourseById(found.id))!))
  })

  // Module list (spec 169 style): read, and replace as a whole. The module editor UI comes later.
  .get('/:id/modules', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json({ modules: await adminModules(found.id) })
  })
  .put('/:id/modules', validate('json', courseModulesSchema), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    replaceModules(found.id, c.req.valid('json').modules)
    return c.json({ modules: await adminModules(found.id) })
  })

  // Course completion, marked by hand until modules exist (spec 068 will complete courses automatically).
  .post('/:id/completions', validate('json', z.object({ userId: z.string().min(1) })), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { userId } = c.req.valid('json')
    const enrolled = await db.query.enrollmentGrant.findFirst({
      columns: { id: true },
      where: and(eq(enrollmentGrant.userId, userId), eq(enrollmentGrant.courseId, found.id)),
    })
    if (!enrolled) throw new HTTPException(400, { message: 'User is not enrolled in this course' })
    completeCourse(userId, found, c.get('user')!.id)
    return c.json({ message: 'Course completed' })
  })
  .delete('/:id/completions/:userId', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    uncompleteCourse(c.req.param('userId'), found.id)
    return c.json({ message: 'Completion removed' })
  })
