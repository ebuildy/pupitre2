import { type CourseSpec, courseModulesSchema, courseSpecSchema } from '@pupitre/shared'
import type { z } from 'zod'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { category, course } from '../db/schema/index.ts'
import { adminModules, expandModuleIndexes, replaceModules } from './modules-admin.ts'
import { adminPrerequisites, setPrerequisites } from './prerequisites.ts'

type Course = typeof course.$inferSelect
type SpecModule = NonNullable<CourseSpec['modules']>[number]

/** Spec 169: the course as a portable document (references by slug). */
export async function readDefinition(c: Course): Promise<{ slug: string; spec: z.output<typeof courseSpecSchema> }> {
  const cat = c.categoryId ? db.select({ slug: category.slug }).from(category).where(eq(category.id, c.categoryId)).get() : null
  const prereqs = adminPrerequisites(c.id)
  const slugs = new Map(
    prereqs.length
      ? db.select({ id: course.id, slug: course.slug }).from(course).all().map((r) => [r.id, r.slug])
      : [],
  )
  const modules = await adminModules(c.id)
  return {
    slug: c.slug,
    spec: {
      title: c.title,
      description: c.description,
      category: cat?.slug ?? null,
      difficulty: c.difficulty,
      visibility: c.visibility,
      status: c.status,
      xpRequired: c.xpRequired,
      completionXp: c.completionXp,
      inPerson: c.inPerson,
      thumbnailUrl: c.thumbnailUrl,
      badge: c.badgeName && c.badgeIcon ? { name: c.badgeName, icon: c.badgeIcon } : null,
      prerequisites: prereqs.map((p) => ({
        course: slugs.get(p.courseId) ?? p.courseId,
        minScore: p.minScore,
        modules: p.modules,
      })),
      modules: modules.map(({ id: _, ...m }) => ({ ...m, type: m.type as SpecModule['type'] })),
    },
  }
}

function categoryId(slug: string | null | undefined) {
  if (!slug) return null
  const found = db.select({ id: category.id }).from(category).where(eq(category.slug, slug)).get()
  if (!found) throw new HTTPException(400, { message: `Unknown category: ${slug}` })
  return found.id
}

/**
 * Spec 169: creates the course, or replaces it whole (metadata, prerequisites, modules) — in one transaction.
 * Modules are matched by slug, so progress on kept modules stays.
 */
export async function writeDefinition(slug: string, rawSpec: CourseSpec, existing: Course | null) {
  const spec = courseSpecSchema.parse(rawSpec)
  const modules = await expandModuleIndexes(courseModulesSchema.parse({ modules: spec.modules }).modules)
  const values = {
    slug,
    title: spec.title,
    description: spec.description ?? null,
    categoryId: categoryId(spec.category),
    difficulty: spec.difficulty ?? null,
    visibility: spec.visibility ?? 'private',
    status: spec.status ?? 'draft',
    xpRequired: spec.xpRequired ?? 0,
    ...(spec.completionXp !== undefined ? { completionXp: spec.completionXp } : {}),
    inPerson: spec.inPerson ?? false,
    thumbnailUrl: spec.thumbnailUrl ?? null,
    badgeName: spec.badge?.name ?? null,
    badgeIcon: spec.badge?.icon ?? null,
  }
  const prerequisites = (spec.prerequisites ?? []).map((p) => {
    const required = db.select({ id: course.id }).from(course).where(eq(course.slug, p.course)).get()
    if (!required) throw new HTTPException(400, { message: `Unknown prerequisite course: ${p.course}` })
    return { courseId: required.id, minScore: p.minScore, modules: p.modules }
  })
  let id = existing?.id
  try {
    db.transaction((tx) => {
      if (existing) tx.update(course).set(values).where(eq(course.id, existing.id)).run()
      else id = tx.insert(course).values(values).returning({ id: course.id }).get()!.id
      setPrerequisites(tx, id!, prerequisites)
    })
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed: course\.slug/.test(String(err.cause ?? err.message))) {
      throw new HTTPException(409, { message: 'Course already exists' })
    }
    throw err
  }
  // Module replacement validates quizzes and runs its own transaction.
  replaceModules(id!, modules)
  return id!
}
