import {
  type AdminCourse,
  type AdminCourseEnrollment,
  courseCreateSchema,
  courseUpdateSchema,
  type EnrollmentSource,
} from '@pupitre/shared'
import { and, asc, eq, max, min, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { course, courseCompletion, enrollmentGrant, user } from '../../db/schema/index.ts'
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
      const [created] = await db.insert(course).values(input).returning()
      return c.json<AdminCourse>(toAdminCourse(created!, 0, tree), 201)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .get('/:id', async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json<AdminCourse>(toAdminCourse(found, await countEnrolled(found.id), await CategoryTree.load()))
  })
  .patch('/:id', validate('json', courseUpdateSchema), async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkCategory(tree, input.categoryId)
    try {
      const [updated] = await db.update(course).set(input).where(eq(course.id, found.id)).returning()
      return c.json<AdminCourse>(toAdminCourse(updated!, await countEnrolled(found.id), tree))
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
    // Removes the direct grants (the learner's own and admin ones). Group/path grants will stay.
    await revoke(c.req.param('userId'), found.id, ['self', 'admin'])
    return c.json({ message: 'User unenrolled' })
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
