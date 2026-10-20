import {
  badgeRarityResponseSchema,
  myBadgesResponseSchema,
  mySkillsResponseSchema,
  type SkillDetail,
  skillDetailSchema,
  skillListResponseSchema,
  type SkillModuleStatus,
  SKILL_SLUG_PATTERN,
} from '@pupitre/shared'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { course, courseModule, moduleProgress, moduleSkill, skill, skillLevel } from '../db/schema/index.ts'
import { $, createRoute, createRouter, errors, json, params, PUBLIC } from '../lib/openapi.ts'
import { requireAuth } from '../middleware/session.ts'
import { badgeHolders, earnedBadges } from '../services/badges.ts'
import { completionsFor } from '../services/xp.ts'
import { enrolledCourseIds, findCourseBySlug, listMyCourses } from '../services/courses.ts'
import { courseExtras, userSkillLevel } from '../services/skills.ts'

const getMyBadges = createRoute({
  method: 'get',
  path: '/',
  tags: ['Me'],
  summary: 'My badges',
  description: 'Specs 106, 107: badges earned, and the badges of published public courses still to earn.',
  responses: { 200: json(myBadgesResponseSchema), ...errors(401) },
})

/** Specs 106, 107: the signed-in user's badges, and the ones still to earn. */
export const myBadgeRoutes = $(createRouter().use(requireAuth)).openapi(getMyBadges, (c) => {
  const me = c.get('user')
  const earned = earnedBadges(me.id)
  const earnedCourses = new Set(earned.flatMap((b) => (b.course ? [b.course.slug] : [])))
  const withBadge = db
    .select({ id: course.id, slug: course.slug, title: course.title, name: course.badgeName, icon: course.badgeIcon })
    .from(course)
    .where(
      and(eq(course.status, 'published'), eq(course.visibility, 'public'), isNotNull(course.badgeName), isNotNull(course.badgeIcon)),
    )
    .orderBy(asc(course.title))
    .all()
  const holders = badgeHolders(withBadge.map((x) => x.id))
  return c.json({
    earned,
    locked: withBadge
      .filter((x) => !earnedCourses.has(x.slug))
      .map((x) => ({ name: x.name!, icon: x.icon!, course: { slug: x.slug, title: x.title }, earnedBy: holders.get(x.id) ?? 0 })),
  }, 200)
})

const getBadgeRarity = createRoute({
  method: 'get',
  path: '/{courseSlug}',
  tags: ['Badges'],
  security: PUBLIC,
  summary: "Rarity of a course's badge",
  description: 'Spec 109: the number of learners holding it.',
  request: { params: params('courseSlug') },
  responses: { 200: json(badgeRarityResponseSchema), ...errors(404) },
})

/** Spec 109: rarity of a course badge. */
export const badgeRoutes = createRouter().openapi(getBadgeRarity, async (c) => {
  const found = await findCourseBySlug(c.req.param('courseSlug'))
  if (!found || found.status === 'draft') throw new HTTPException(404, { message: 'Course not found' })
  return c.json({ courseSlug: found.slug, earnedBy: badgeHolders([found.id]).get(found.id) ?? 0 }, 200)
})

const getMySkills = createRoute({
  method: 'get',
  path: '/',
  tags: ['Me'],
  summary: 'My skills',
  description: 'Spec 114: skill levels, and the skills of enrolled unfinished courses without a level yet.',
  responses: { 200: json(mySkillsResponseSchema), ...errors(401) },
})

/** Spec 114: levels, and skills of enrolled unfinished courses. */
export const mySkillRoutes = $(createRouter().use(requireAuth)).openapi(getMySkills, async (c) => {
  const me = c.get('user')
  const levels = db
    .select({
      slug: skill.slug,
      label: skill.label,
      level: skillLevel.level,
      completedCourses: skillLevel.completedCourses,
      totalCourses: skillLevel.totalCourses,
      updatedAt: skillLevel.updatedAt,
    })
    .from(skillLevel)
    .innerJoin(skill, eq(skill.id, skillLevel.skillId))
    .where(eq(skillLevel.userId, me.id))
    .orderBy(asc(skill.label))
    .all()
  const known = new Set(levels.map((l) => l.slug))
  const mine = await listMyCourses(me.id)
  const completed = await completionsFor(me.id, mine.map((m) => m.course.id))
  const unfinished = mine.filter((m) => !completed.has(m.course.id) && m.course.status === 'published').map((m) => m.course.id)
  const extras = courseExtras(unfinished, null)
  const inProgress = new Map<string, { slug: string; label: string }>()
  for (const id of unfinished) for (const s of extras.skills.get(id) ?? []) if (!known.has(s.slug)) inProgress.set(s.slug, s)
  return c.json({
    skills: levels.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })),
    inProgress: [...inProgress.values()].sort((a, b) => a.label.localeCompare(b.label)),
  }, 200)
})

const listSkills = createRoute({
  method: 'get',
  path: '/',
  tags: ['Skills'],
  security: PUBLIC,
  summary: 'Skills',
  description: 'Spec 110: skills taught by visible modules of published public courses, with their course count.',
  responses: { 200: json(skillListResponseSchema) },
})

const getSkill = createRoute({
  method: 'get',
  path: '/{slug}',
  tags: ['Skills'],
  security: PUBLIC,
  summary: 'A skill and what teaches it',
  description: "Specs 110–112: courses and modules teaching it; signed in, the viewer's level and each module's status.",
  request: { params: params('slug') },
  responses: { 200: json(skillDetailSchema), ...errors(400, 404) },
})

/** Specs 110–112: skills and what teaches them. */
export const skillRoutes = createRouter()
  .openapi(listSkills, (c) => {
    const rows = db
      .select({
        slug: skill.slug,
        label: skill.label,
        courseCount: sql<number>`count(DISTINCT ${course.id})`,
      })
      .from(skill)
      .innerJoin(moduleSkill, eq(moduleSkill.skillId, skill.id))
      .innerJoin(courseModule, and(eq(courseModule.id, moduleSkill.moduleId), eq(courseModule.hidden, false)))
      .innerJoin(course, and(eq(course.id, courseModule.courseId), eq(course.status, 'published'), eq(course.visibility, 'public')))
      .groupBy(skill.id)
      .orderBy(asc(skill.label))
      .all()
    return c.json({ skills: rows }, 200)
  })
  .openapi(getSkill, async (c) => {
    const slug = c.req.param('slug')
    if (!SKILL_SLUG_PATTERN.test(slug)) throw new HTTPException(400, { message: 'Invalid skill slug' })
    const found = db.select().from(skill).where(eq(skill.slug, slug)).get()
    if (!found) throw new HTTPException(404, { message: 'Skill not found' })
    const user = c.get('user')

    // Visible modules teaching the skill, in published courses the viewer may see (public, or enrolled).
    const rows = db
      .select({
        courseId: course.id,
        courseSlug: course.slug,
        courseTitle: course.title,
        difficulty: course.difficulty,
        visibility: course.visibility,
        moduleId: courseModule.id,
        slug: courseModule.slug,
        name: courseModule.name,
        type: courseModule.type,
      })
      .from(moduleSkill)
      .innerJoin(courseModule, and(eq(courseModule.id, moduleSkill.moduleId), eq(courseModule.hidden, false)))
      .innerJoin(course, and(eq(course.id, courseModule.courseId), eq(course.status, 'published')))
      .where(eq(moduleSkill.skillId, found.id))
      .orderBy(asc(course.title), asc(courseModule.position))
      .all()
    const enrolled = user ? await enrolledCourseIds(user.id, [...new Set(rows.map((r) => r.courseId))]) : new Set<string>()
    const visible = rows.filter((r) => r.visibility === 'public' || enrolled.has(r.courseId) || user?.role === 'admin')

    // Spec 112: completed / available (first, or previous completed) / locked, along the list.
    const progress = user && visible.length
      ? db
          .select({ moduleId: moduleProgress.moduleId, viewedAt: moduleProgress.viewedAt, passedAt: moduleProgress.passedAt })
          .from(moduleProgress)
          .where(and(eq(moduleProgress.userId, user.id), inArray(moduleProgress.moduleId, visible.map((r) => r.moduleId))))
          .all()
      : []
    const isDone = (r: (typeof visible)[number]) => {
      const p = progress.find((x) => x.moduleId === r.moduleId)
      return r.type === 'quiz' ? !!p?.passedAt : !!p?.viewedAt
    }

    const courses = new Map<string, SkillDetail['courses'][number]>()
    let previousDone = true
    for (const r of visible) {
      const done = user ? isDone(r) : false
      const status: SkillModuleStatus | null = user ? (done ? 'completed' : previousDone ? 'available' : 'locked') : null
      previousDone = done
      const entry = courses.get(r.courseId) ?? {
        slug: r.courseSlug,
        title: r.courseTitle,
        difficulty: r.difficulty,
        enrolled: enrolled.has(r.courseId),
        modules: [],
        done: 0,
      }
      entry.modules.push({ slug: r.slug, name: r.name, type: r.type, status })
      if (done) entry.done++
      courses.set(r.courseId, entry)
    }
    return c.json({
      skill: { slug: found.slug, label: found.label, description: found.description },
      courses: [...courses.values()],
      level: user ? userSkillLevel(user.id, slug) : null,
    }, 200)
  })
