import type { CoursePrerequisiteView, PrerequisiteInput } from '@pupitre/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { course, courseModule, coursePrerequisite, moduleProgress } from '../db/schema/index.ts'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Prerequisite = typeof coursePrerequisite.$inferSelect

export function loadPrerequisites(courseIds: string[]) {
  const out = new Map<string, Prerequisite[]>()
  if (courseIds.length === 0) return out
  for (const r of db.select().from(coursePrerequisite).where(inArray(coursePrerequisite.courseId, courseIds)).all()) {
    out.set(r.courseId, [...(out.get(r.courseId) ?? []), r])
  }
  return out
}

/** Module slugs of the required courses, for the admin form and the definition. */
export function prerequisiteModuleSlugs(prereqs: Prerequisite[]) {
  const ids = prereqs.flatMap((p) => p.moduleIds)
  return new Map(
    ids.length
      ? db.select({ id: courseModule.id, slug: courseModule.slug }).from(courseModule).where(inArray(courseModule.id, ids)).all().map((r) => [r.id, r.slug])
      : [],
  )
}

export function adminPrerequisites(courseId: string) {
  const prereqs = loadPrerequisites([courseId]).get(courseId) ?? []
  const slugs = prerequisiteModuleSlugs(prereqs)
  return prereqs.map((p) => ({
    courseId: p.requiredCourseId,
    minScore: p.minScore,
    modules: p.moduleIds.map((id) => slugs.get(id)).filter((s): s is string => !!s),
  }))
}

/** Replaces a course's prerequisites (module slugs resolved in the required course). */
export function setPrerequisites(tx: Tx | typeof db, courseId: string, input: PrerequisiteInput[]) {
  tx.delete(coursePrerequisite).where(eq(coursePrerequisite.courseId, courseId)).run()
  for (const p of input) {
    if (p.courseId === courseId) throw new HTTPException(400, { message: 'A course cannot require itself' })
    const required = tx.select({ id: course.id }).from(course).where(eq(course.id, p.courseId)).get()
    if (!required) throw new HTTPException(400, { message: `Unknown prerequisite course: ${p.courseId}` })
    const slugs = p.modules ?? []
    const modules = slugs.length
      ? tx
          .select({ id: courseModule.id, slug: courseModule.slug })
          .from(courseModule)
          .where(and(eq(courseModule.courseId, p.courseId), inArray(courseModule.slug, slugs)))
          .all()
      : []
    const missing = slugs.find((s) => !modules.some((m) => m.slug === s))
    if (missing) throw new HTTPException(400, { message: `Unknown prerequisite module: ${missing}` })
    tx.insert(coursePrerequisite)
      .values({ courseId, requiredCourseId: p.courseId, minScore: p.minScore || null, moduleIds: modules.map((m) => m.id) })
      .onConflictDoNothing()
      .run()
  }
}

/**
 * Spec 050, for one learner: `minScore` → sum of best quiz scores in the required course ≥ minScore; `modules` → each
 * one done; neither → any progress in that course. All must hold.
 */
export function prerequisiteViews(userId: string | null, courseId: string): CoursePrerequisiteView[] {
  const prereqs = loadPrerequisites([courseId]).get(courseId) ?? []
  if (prereqs.length === 0) return []
  const courses = new Map(
    db
      .select({ id: course.id, slug: course.slug, title: course.title })
      .from(course)
      .where(inArray(course.id, prereqs.map((p) => p.requiredCourseId)))
      .all()
      .map((c) => [c.id, c]),
  )
  const moduleIds = prereqs.flatMap((p) => p.moduleIds)
  const modules = new Map(
    moduleIds.length
      ? db.select({ id: courseModule.id, slug: courseModule.slug, name: courseModule.name }).from(courseModule).where(inArray(courseModule.id, moduleIds)).all().map((m) => [m.id, m])
      : [],
  )
  return prereqs.map((p) => {
    let met = false
    if (userId) {
      const progress = db
        .select({
          moduleId: moduleProgress.moduleId,
          type: courseModule.type,
          bestScore: moduleProgress.bestScore,
          viewedAt: moduleProgress.viewedAt,
          passedAt: moduleProgress.passedAt,
        })
        .from(moduleProgress)
        .innerJoin(courseModule, eq(courseModule.id, moduleProgress.moduleId))
        .where(and(eq(moduleProgress.userId, userId), eq(courseModule.courseId, p.requiredCourseId)))
        .all()
      const score = progress.reduce((n, r) => n + (r.bestScore ?? 0), 0)
      const done = new Set(progress.filter((r) => (r.type === 'quiz' ? r.passedAt : r.viewedAt)).map((r) => r.moduleId))
      const scoreOk = !p.minScore || score >= p.minScore
      const modulesOk = p.moduleIds.every((id) => done.has(id))
      const anyProgress = progress.some((r) => r.viewedAt || r.bestScore !== null)
      met = scoreOk && modulesOk && (p.minScore || p.moduleIds.length ? true : anyProgress)
    }
    const required = courses.get(p.requiredCourseId)!
    return {
      course: { slug: required.slug, title: required.title },
      minScore: p.minScore,
      modules: p.moduleIds.flatMap((id) => {
        const m = modules.get(id)
        return m ? [{ slug: m.slug, name: m.name }] : []
      }),
      met,
    }
  })
}

