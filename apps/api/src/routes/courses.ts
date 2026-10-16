import {
  type CourseDetail,
  type CourseListResponse,
  DIFFICULTIES,
  type MyCoursesResponse,
  type Role,
} from '@pupitre/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { validate } from '../lib/validate.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import {
  canSelfEnroll,
  canView,
  enrolledCourseIds,
  findCourseBySlug,
  grant,
  grantsFor,
  listCatalogue,
  listMyCourses,
  revoke,
  toSummary,
} from '../services/courses.ts'
import { CategoryTree } from '../services/categories.ts'

const NOT_FOUND = 'Course not found'

const catalogueQuery = z.object({
  search: z.string().optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  // `?category=a&category=b`: category slugs (OR), each including its subcategories
  category: z.union([z.string(), z.array(z.string())]).optional(),
})

/** Specs 040, 045: public catalogue and course page. */
export const courseRoutes = new Hono<AppEnv>()
  .get('/', validate('query', catalogueQuery), async (c) => {
    const { search, difficulty, category } = c.req.valid('query')
    const categories = category === undefined ? [] : [category].flat()
    const tree = await CategoryTree.load()
    const result = await listCatalogue(tree, { search, difficulty, categories })

    const user = c.get('user')
    const enrolled = user
      ? await enrolledCourseIds(
          user.id,
          result.courses.map((x) => x.id),
        )
      : new Set<string>()

    return c.json<CourseListResponse>({
      courses: result.courses.map((x) => toSummary(x, enrolled.has(x.id), tree)),
      total: result.courses.length,
      categories: result.categories,
    })
  })
  .get('/:slug', async (c) => {
    const found = await findCourseBySlug(c.req.param('slug'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })

    const user = c.get('user')
    const grants = user ? await grantsFor(user.id, found.id) : []
    const enrolled = grants.length > 0
    // Existence of a course the user may not see is not revealed.
    if (!canView(found, user?.role as Role | undefined, enrolled)) throw new HTTPException(404, { message: NOT_FOUND })

    return c.json<CourseDetail>({
      ...toSummary(found, enrolled, await CategoryTree.load()),
      visibility: found.visibility,
      status: found.status,
      enrollment: enrolled
        ? {
            enrolledAt: grants[0]!.createdAt.toISOString(),
            canUnenroll: grants.every((g) => g.source === 'self'),
          }
        : null,
    })
  })

/** Spec 047: self-enrollment. */
export const enrollmentRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post('/:slug', async (c) => {
    const user = c.get('user')!
    const found = await findCourseBySlug(c.req.param('slug'))
    const enrolled = found ? (await grantsFor(user.id, found.id)).length > 0 : false
    if (!found || !canView(found, user.role as Role, enrolled)) throw new HTTPException(404, { message: NOT_FOUND })
    if (!canSelfEnroll(found)) throw new HTTPException(403, { message: 'Enrollment is not open for this course' })

    await grant(user.id, found.id, 'self', user.id)
    return c.json({ message: 'Enrolled successfully' })
  })
  .delete('/:slug', async (c) => {
    const user = c.get('user')!
    const found = await findCourseBySlug(c.req.param('slug'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })

    // Only the learner's own grant: access given by an admin (or later a group/path) stays.
    await revoke(user.id, found.id, ['self'])
    return c.json({ message: 'Unenrolled successfully' })
  })

/** Spec 052: the signed-in user's courses. */
export const myRoutes = new Hono<AppEnv>().use(requireAuth).get('/courses', async (c) => {
  const rows = await listMyCourses(c.get('user')!.id)
  const tree = await CategoryTree.load()
  return c.json<MyCoursesResponse>({
    courses: rows.map(({ course, enrolledAt }) => ({
      ...toSummary(course, true, tree),
      status: course.status,
      enrolledAt: new Date(enrolledAt).toISOString(),
    })),
  })
})
