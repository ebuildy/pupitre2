import {
  DIFFICULTY_ORDER,
  type Difficulty,
  type SkillLevel,
  skillLabel,
  skillLevelOrder,
  type SkillRef,
} from '@pupitre/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { course, courseCompletion, courseModule, moduleProgress, moduleSkill, skill, skillLevel } from '../db/schema/index.ts'

type Tx = Pick<typeof db, 'select' | 'selectDistinct' | 'insert' | 'update' | 'delete'>

/** Spec 191: skills are created on the fly. Returns slug → id. */
export function ensureSkills(slugs: string[], tx: Tx = db) {
  const unique = [...new Set(slugs)]
  if (unique.length === 0) return new Map<string, string>()
  tx.insert(skill)
    .values(unique.map((slug) => ({ slug, label: skillLabel(slug) })))
    .onConflictDoNothing({ target: skill.slug })
    .run()
  return new Map(
    tx.select({ id: skill.id, slug: skill.slug }).from(skill).where(inArray(skill.slug, unique)).all().map((r) => [r.slug, r.id]),
  )
}

/** Skills of each module among `moduleIds`. */
export function moduleSkills(moduleIds: string[]) {
  const out = new Map<string, SkillRef[]>()
  if (moduleIds.length === 0) return out
  const rows = db
    .select({ moduleId: moduleSkill.moduleId, slug: skill.slug, label: skill.label })
    .from(moduleSkill)
    .innerJoin(skill, eq(skill.id, moduleSkill.skillId))
    .where(inArray(moduleSkill.moduleId, moduleIds))
    .orderBy(asc(skill.slug))
    .all()
  for (const { moduleId, ...ref } of rows) out.set(moduleId, [...(out.get(moduleId) ?? []), ref])
  return out
}

/**
 * Per course among `courseIds`: skills (union of its visible modules', spec 110), visible module count, and — for
 * `userId` — the number of those modules done (spec 044 progress).
 */
export function courseExtras(courseIds: string[], userId: string | null) {
  const skills = new Map<string, SkillRef[]>()
  const moduleCount = new Map<string, number>()
  const done = new Map<string, number>()
  if (courseIds.length === 0) return { skills, moduleCount, done }

  for (const r of db
    .selectDistinct({ courseId: courseModule.courseId, slug: skill.slug, label: skill.label })
    .from(moduleSkill)
    .innerJoin(courseModule, eq(courseModule.id, moduleSkill.moduleId))
    .innerJoin(skill, eq(skill.id, moduleSkill.skillId))
    .where(and(inArray(courseModule.courseId, courseIds), eq(courseModule.hidden, false)))
    .orderBy(asc(skill.slug))
    .all()) {
    skills.set(r.courseId, [...(skills.get(r.courseId) ?? []), { slug: r.slug, label: r.label }])
  }
  for (const r of db
    .select({ courseId: courseModule.courseId, n: sql<number>`count(*)` })
    .from(courseModule)
    .where(and(inArray(courseModule.courseId, courseIds), eq(courseModule.hidden, false)))
    .groupBy(courseModule.courseId)
    .all()) {
    moduleCount.set(r.courseId, r.n)
  }
  if (userId) {
    for (const r of db
      .select({ courseId: courseModule.courseId, n: sql<number>`count(*)` })
      .from(moduleProgress)
      .innerJoin(courseModule, eq(courseModule.id, moduleProgress.moduleId))
      .where(
        and(
          eq(moduleProgress.userId, userId),
          inArray(courseModule.courseId, courseIds),
          eq(courseModule.hidden, false),
          sql`CASE WHEN ${courseModule.type} = 'quiz' THEN ${moduleProgress.passedAt} IS NOT NULL ELSE ${moduleProgress.viewedAt} IS NOT NULL END`,
        ),
      )
      .groupBy(courseModule.courseId)
      .all()) {
      done.set(r.courseId, r.n)
    }
  }
  return { skills, moduleCount, done }
}

/** Ids of the published courses teaching the skill (through a visible module). */
export function coursesTeaching(skillId: string, tx: Pick<typeof db, 'selectDistinct'> = db) {
  return tx
    .selectDistinct({ id: course.id, difficulty: course.difficulty })
    .from(moduleSkill)
    .innerJoin(courseModule, eq(courseModule.id, moduleSkill.moduleId))
    .innerJoin(course, eq(course.id, courseModule.courseId))
    .where(and(eq(moduleSkill.skillId, skillId), eq(courseModule.hidden, false), eq(course.status, 'published')))
    .all()
}

/**
 * Spec 113, at each course completion, for each skill of the course: completed / total courses teaching it; level =
 * master when every course is completed, else the highest difficulty completed (never decreases).
 */
export function updateSkillLevels(tx: Tx, userId: string, courseId: string, difficulty: Difficulty | null) {
  const skillIds = tx
    .selectDistinct({ id: moduleSkill.skillId })
    .from(moduleSkill)
    .innerJoin(courseModule, eq(courseModule.id, moduleSkill.moduleId))
    .where(and(eq(courseModule.courseId, courseId), eq(courseModule.hidden, false)))
    .all()
    .map((r) => r.id)
  const completedIds = new Set(
    tx
      .select({ courseId: courseCompletion.courseId })
      .from(courseCompletion)
      .where(eq(courseCompletion.userId, userId))
      .all()
      .map((r) => r.courseId),
  )
  const now = new Date()
  for (const skillId of skillIds) {
    const teaching = coursesTeaching(skillId, tx)
    const total = teaching.length
    const completed = teaching.filter((c) => completedIds.has(c.id)).length
    const previous = tx
      .select({ level: skillLevel.level })
      .from(skillLevel)
      .where(and(eq(skillLevel.userId, userId), eq(skillLevel.skillId, skillId)))
      .get()
    let order = Math.max(DIFFICULTY_ORDER[difficulty ?? 'beginner'], previous ? skillLevelOrder(previous.level) : 0)
    if (total > 0 && completed >= total) order = 4
    const level: SkillLevel = (['beginner', 'intermediate', 'advanced', 'master'] as const)[Math.min(order, 4) - 1]!
    tx.insert(skillLevel)
      .values({ userId, skillId, level, completedCourses: completed, totalCourses: total, updatedAt: now })
      .onConflictDoUpdate({
        target: [skillLevel.userId, skillLevel.skillId],
        set: { level, completedCourses: completed, totalCourses: total, updatedAt: now },
      })
      .run()
  }
}

/** A skill by slug (label from the table, or derived from the slug when unknown). */
export function skillRef(slug: string): SkillRef {
  const found = db.select({ slug: skill.slug, label: skill.label }).from(skill).where(eq(skill.slug, slug)).get()
  return found ?? { slug, label: skillLabel(slug) }
}

export function userSkillLevel(userId: string, slug: string): SkillLevel | null {
  const row = db
    .select({ level: skillLevel.level })
    .from(skillLevel)
    .innerJoin(skill, eq(skill.id, skillLevel.skillId))
    .where(and(eq(skillLevel.userId, userId), eq(skill.slug, slug)))
    .get()
  return row?.level ?? null
}
