import {
  badgeLeaderboardResponseSchema,
  courseDetailSchema,
  courseListResponseSchema,
  DIFFICULTIES,
  leaderboardResponseSchema,
  messageSchema,
  myCoursesResponseSchema,
  myXpResponseSchema,
  type Role,
  skillLevelOrder,
} from '@pupitre/shared'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { $, createRoute, createRouter, errors, json, params, PUBLIC } from '../lib/openapi.ts'
import { requireAuth } from '../middleware/session.ts'
import {
  canSelfEnroll,
  courseIdsWithSkill,
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
import { courseExtras, skillRef, userSkillLevel } from '../services/skills.ts'
import { completionsFor, totalXp, xpHistory, xpRanking } from '../services/xp.ts'
import { badgeRanking } from '../services/badges.ts'
import { prerequisiteViews } from '../services/prerequisites.ts'

const NOT_FOUND = 'Course not found'

const catalogueQuery = z.object({
  search: z.string().optional(),
  /** Spec 042: courses teaching this skill, at or above the learner's level in it. */
  skill: z.string().optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  // `?category=a&category=b`: category slugs (OR), each including its subcategories
  category: z.union([z.string(), z.array(z.string())]).optional(),
})

const getCatalogue = createRoute({
  method: 'get',
  path: '/',
  tags: ['Courses'],
  security: PUBLIC,
  summary: 'Course catalogue',
  description: 'Spec 040: published public courses, filtered; `category` may be repeated (OR, subcategories included).',
  request: { query: catalogueQuery },
  responses: { 200: json(courseListResponseSchema), ...errors(400) },
})

const getCourse = createRoute({
  method: 'get',
  path: '/{slug}',
  tags: ['Courses'],
  security: PUBLIC,
  summary: 'Course page',
  description: 'Spec 045. A course the viewer may not see is 404.',
  request: { params: params('slug') },
  responses: { 200: json(courseDetailSchema), ...errors(404) },
})

/** Specs 040, 045: public catalogue and course page. */
export const courseRoutes = createRouter()
  .openapi(getCatalogue, async (c) => {
    const { search, difficulty, category, skill } = c.req.valid('query')
    const categories = category === undefined ? [] : [category].flat()
    const tree = await CategoryTree.load()
    const user = c.get('user')
    const level = skill && user ? userSkillLevel(user.id, skill) : null
    const result = await listCatalogue(tree, {
      search,
      difficulty,
      categories,
      courseIds: skill ? courseIdsWithSkill(skill) : undefined,
      // "Cours adaptés à ton niveau": difficulty ≥ level (a master gets the advanced ones).
      minDifficulty: level ? Math.min(skillLevelOrder(level), 3) : undefined,
    })

    const ids = result.courses.map((x) => x.id)
    const enrolled = user ? await enrolledCourseIds(user.id, ids) : new Set<string>()
    const completed = user ? await completionsFor(user.id, ids) : new Map<string, Date>()
    const extras = courseExtras(ids, user?.id ?? null)

    return c.json({
      courses: result.courses.map((x) =>
        toSummary(x, tree, { enrolled: enrolled.has(x.id), completed: completed.has(x.id) }, extras),
      ),
      total: result.courses.length,
      categories: result.categories,
      skillFilter: skill ? { ...skillRef(skill), level } : null,
    }, 200)
  })
  .openapi(getCourse, async (c) => {
    const found = await findCourseBySlug(c.req.param('slug'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })

    const user = c.get('user')
    const grants = user ? await grantsFor(user.id, found.id) : []
    const enrolled = grants.length > 0
    // Existence of a course the user may not see is not revealed.
    if (!canView(found, user?.role as Role | undefined, enrolled)) throw new HTTPException(404, { message: NOT_FOUND })

    const completedAt = user ? (await completionsFor(user.id, [found.id])).get(found.id) : undefined
    const prerequisites = prerequisiteViews(user?.id ?? null, found.id)
    return c.json({
      ...toSummary(found, await CategoryTree.load(), { enrolled, completed: !!completedAt }, courseExtras([found.id], user?.id ?? null)),
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
      prerequisites,
      prerequisitesMet: user?.role === 'admin' || prerequisites.every((p) => p.met),
    }, 200)
  })

const enroll = createRoute({
  method: 'post',
  path: '/{slug}',
  tags: ['Courses'],
  summary: 'Enroll in a course',
  description: 'Spec 047: self-enrollment, open for published public courses; the XP gate applies (spec 049).',
  request: { params: params('slug') },
  responses: { 200: json(messageSchema), ...errors(401, 403, 404) },
})

const unenroll = createRoute({
  method: 'delete',
  path: '/{slug}',
  tags: ['Courses'],
  summary: 'Withdraw from a course',
  description: "Removes the learner's own grant only: access given by an admin, a manager, a group or a path stays.",
  request: { params: params('slug') },
  responses: { 200: json(messageSchema), ...errors(401, 404) },
})

/** Spec 047: self-enrollment. */
export const enrollmentRoutes = $(createRouter().use(requireAuth))
  .openapi(enroll, async (c) => {
    const user = c.get('user')
    const found = await findCourseBySlug(c.req.param('slug'))
    const enrolled = found ? (await grantsFor(user.id, found.id)).length > 0 : false
    if (!found || !canView(found, user.role as Role, enrolled)) throw new HTTPException(404, { message: NOT_FOUND })
    if (!canSelfEnroll(found)) throw new HTTPException(403, { message: 'Enrollment is not open for this course' })
    // Spec 049: the XP gate applies to self-enrollment only (not to admin grants).
    if (found.xpRequired > 0 && !enrolled && totalXp(user.id) < found.xpRequired) {
      throw new HTTPException(403, { message: 'Not enough XP to enroll in this course' })
    }

    await grant(user.id, found.id, 'self', user.id)
    return c.json({ message: 'Enrolled successfully' }, 200)
  })
  .openapi(unenroll, async (c) => {
    const user = c.get('user')
    const found = await findCourseBySlug(c.req.param('slug'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })

    // Only the learner's own grant: access given by an admin (or later a group/path) stays.
    await revoke(user.id, found.id, ['self'])
    return c.json({ message: 'Unenrolled successfully' }, 200)
  })

const getMyCourses = createRoute({
  method: 'get',
  path: '/courses',
  tags: ['Me'],
  summary: 'My courses',
  description: 'Spec 052: the courses the signed-in user has access to, with progress and last activity.',
  responses: { 200: json(myCoursesResponseSchema), ...errors(401) },
})

const getMyXp = createRoute({
  method: 'get',
  path: '/xp',
  tags: ['Me'],
  summary: 'My XP',
  description: 'Specs 104, 105: total, history (most recent first) and what is left to earn.',
  responses: { 200: json(myXpResponseSchema), ...errors(401) },
})

/** The signed-in user's courses (spec 052) and XP (specs 104, 105). */
export const myRoutes = $(createRouter().use(requireAuth))
  .openapi(getMyCourses, async (c) => {
    const userId = c.get('user').id
    const rows = await listMyCourses(userId)
    const tree = await CategoryTree.load()
    const ids = rows.map((r) => r.course.id)
    const completed = await completionsFor(userId, ids)
    const extras = courseExtras(ids, userId)
    return c.json({
      courses: rows.map(({ course, enrolledAt, lastActivity }) => ({
        ...toSummary(course, tree, { enrolled: true, completed: completed.has(course.id) }, extras),
        status: course.status,
        enrolledAt: new Date(enrolledAt).toISOString(),
        completedAt: completed.get(course.id)?.toISOString() ?? null,
        lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      })),
    }, 200)
  })
  .openapi(getMyXp, async (c) => {
    const userId = c.get('user').id
    const rows = await listMyCourses(userId)
    const completed = await completionsFor(
      userId,
      rows.map((r) => r.course.id),
    )
    return c.json({
      total: totalXp(userId),
      history: await xpHistory(userId),
      inProgress: rows
        .filter(({ course }) => !completed.has(course.id) && course.status === 'published')
        .map(({ course }) => ({ slug: course.slug, title: course.title, completionXp: course.completionXp })),
    }, 200)
  })

const LEADERBOARD_SIZE = 20

const getBadgeLeaderboard = createRoute({
  method: 'get',
  path: '/badges',
  tags: ['Leaderboard'],
  security: PUBLIC,
  summary: 'Leaderboard by badges',
  description: `Spec 108: the top ${LEADERBOARD_SIZE} learners by number of badges.`,
  responses: { 200: json(badgeLeaderboardResponseSchema) },
})

const getXpLeaderboard = createRoute({
  method: 'get',
  path: '/',
  tags: ['Leaderboard'],
  security: PUBLIC,
  summary: 'Leaderboard by XP',
  description: `The top ${LEADERBOARD_SIZE} learners by XP, and the signed-in user's own position.`,
  responses: { 200: json(leaderboardResponseSchema) },
})

/** Leaderboard (public): by XP, or by badges (spec 108). */
export const leaderboardRoutes = createRouter()
  .openapi(getBadgeLeaderboard, (c) => c.json({ leaderboard: badgeRanking(LEADERBOARD_SIZE) }, 200))
  .openapi(getXpLeaderboard, async (c) => {
    const ranking = await xpRanking()
    const user = c.get('user')
    const mine = user ? ranking.find((r) => r.userId === user.id) : undefined
    return c.json({
      leaderboard: ranking
        .slice(0, LEADERBOARD_SIZE)
        .map(({ rank, userId, username, name, image, xp }) => ({ rank, id: userId, username: username ?? name, name, image, xp })),
      me: mine ? { rank: mine.rank, xp: mine.xp } : null,
    }, 200)
  })
