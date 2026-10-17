import {
  type MyBadgesResponse,
  type MySkillsResponse,
  type SkillDetail,
  type SkillListResponse,
  type SkillModuleStatus,
  SKILL_SLUG_PATTERN,
} from '@pupitre/shared'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { course, courseModule, moduleProgress, moduleSkill, skill, skillLevel } from '../db/schema/index.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { badgeHolders, earnedBadges } from '../services/badges.ts'
import { completionsFor } from '../services/xp.ts'
import { enrolledCourseIds, findCourseBySlug, listMyCourses } from '../services/courses.ts'
import { courseExtras, userSkillLevel } from '../services/skills.ts'

/** Specs 106, 107: the signed-in user's badges, and the ones still to earn. */
export const myBadgeRoutes = new Hono<AppEnv>().use(requireAuth).get('/', (c) => {
  const me = c.get('user')!
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
  return c.json<MyBadgesResponse>({
    earned,
    locked: withBadge
      .filter((x) => !earnedCourses.has(x.slug))
      .map((x) => ({ name: x.name!, icon: x.icon!, course: { slug: x.slug, title: x.title }, earnedBy: holders.get(x.id) ?? 0 })),
  })
})

/** Spec 109: rarity of a course badge. */
export const badgeRoutes = new Hono<AppEnv>().get('/:courseSlug', async (c) => {
  const found = await findCourseBySlug(c.req.param('courseSlug'))
  if (!found || found.status === 'draft') throw new HTTPException(404, { message: 'Course not found' })
  return c.json({ courseSlug: found.slug, earnedBy: badgeHolders([found.id]).get(found.id) ?? 0 })
})

/** Spec 114: levels, and skills of enrolled unfinished courses. */
export const mySkillRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const me = c.get('user')!
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
  return c.json<MySkillsResponse>({
    skills: levels.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })),
    inProgress: [...inProgress.values()].sort((a, b) => a.label.localeCompare(b.label)),
  })
})

/** Specs 110–112: skills and what teaches them. */
export const skillRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
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
    return c.json<SkillListResponse>({ skills: rows })
  })
  .get('/:slug', async (c) => {
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
    return c.json<SkillDetail>({
      skill: { slug: found.slug, label: found.label, description: found.description },
      courses: [...courses.values()],
      level: user ? userSkillLevel(user.id, slug) : null,
    })
  })
