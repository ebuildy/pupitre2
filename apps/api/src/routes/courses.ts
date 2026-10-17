import {
  type CourseDetail,
  type CourseListResponse,
  DIFFICULTIES,
  type LeaderboardResponse,
  type MyCoursesResponse,
  type MyXpResponse,
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
import { completionsFor, totalXp, xpHistory, xpRanking } from '../services/xp.ts'

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
    const ids = result.courses.map((x) => x.id)
    const enrolled = user ? await enrolledCourseIds(user.id, ids) : new Set<string>()
    const completed = user ? await completionsFor(user.id, ids) : new Map<string, Date>()

    return c.json<CourseListResponse>({
      courses: result.courses.map((x) =>
        toSummary(x, tree, { enrolled: enrolled.has(x.id), completed: completed.has(x.id) }),
      ),
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

    const completedAt = user ? (await completionsFor(user.id, [found.id])).get(found.id) : undefined
    return c.json<CourseDetail>({
      ...toSummary(found, await CategoryTree.load(), { enrolled, completed: !!completedAt }),
      visibility: found.visibility,
      status: found.status,
      enrollment: enrolled
        ? {
            enrolledAt: grants[0]!.createdAt.toISOString(),
            canUnenroll: grants.every((g) => g.source === 'self'),
          }
        : null,
      completedAt: completedAt?.toISOString() ?? null,
      userXp: user ? totalXp(user.id) : null,
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
    // Spec 049: the XP gate applies to self-enrollment only (not to admin grants).
    if (found.xpRequired > 0 && !enrolled && totalXp(user.id) < found.xpRequired) {
      throw new HTTPException(403, { message: 'Not enough XP to enroll in this course' })
    }

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

/** The signed-in user's courses (spec 052) and XP (specs 104, 105). */
export const myRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/courses', async (c) => {
    const userId = c.get('user')!.id
    const rows = await listMyCourses(userId)
    const tree = await CategoryTree.load()
    const completed = await completionsFor(
      userId,
      rows.map((r) => r.course.id),
    )
    return c.json<MyCoursesResponse>({
      courses: rows.map(({ course, enrolledAt }) => ({
        ...toSummary(course, tree, { enrolled: true, completed: completed.has(course.id) }),
        status: course.status,
        enrolledAt: new Date(enrolledAt).toISOString(),
        completedAt: completed.get(course.id)?.toISOString() ?? null,
      })),
    })
  })
  .get('/xp', async (c) => {
    const userId = c.get('user')!.id
    const rows = await listMyCourses(userId)
    const completed = await completionsFor(
      userId,
      rows.map((r) => r.course.id),
    )
    return c.json<MyXpResponse>({
      total: totalXp(userId),
      history: await xpHistory(userId),
      inProgress: rows
        .filter(({ course }) => !completed.has(course.id) && course.status === 'published')
        .map(({ course }) => ({ slug: course.slug, title: course.title, completionXp: course.completionXp })),
    })
  })

const LEADERBOARD_SIZE = 20

/** XP leaderboard (public). */
export const leaderboardRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const ranking = await xpRanking()
  const user = c.get('user')
  const mine = user ? ranking.find((r) => r.userId === user.id) : undefined
  return c.json<LeaderboardResponse>({
    leaderboard: ranking
      .slice(0, LEADERBOARD_SIZE)
      .map(({ rank, userId, username, name, image, xp }) => ({ rank, id: userId, username: username ?? name, name, image, xp })),
    me: mine ? { rank: mine.rank, xp: mine.xp } : null,
  })
})
