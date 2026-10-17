import type { MyPath, PublicPath, SkillRef } from '@pupitre/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { learningPath, pathEnrollment } from '../db/schema/index.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { type LearningPath, pathItems, pathProgress } from '../services/paths.ts'
import { courseExtras } from '../services/skills.ts'

/** Spec 121: course paths show the union of their courses' skills; skill paths their own skills. */
function toPublic(paths: LearningPath[]): PublicPath[] {
  const items = pathItems(paths.map((p) => p.id))
  const courseIds = [...items.values()].flat().flatMap((i) => (i.kind === 'course' ? [i.id] : []))
  const extras = courseExtras(courseIds, null)
  return paths.map((p) => {
    const members = items.get(p.id) ?? []
    const skills = new Map<string, SkillRef>()
    for (const m of members) {
      if (m.kind === 'skill') skills.set(m.slug, { slug: m.slug, label: m.title })
      else for (const s of extras.skills.get(m.id) ?? []) skills.set(s.slug, s)
    }
    return {
      slug: p.slug,
      title: p.title,
      description: p.description,
      kind: p.kind,
      level: p.level,
      skills: [...skills.values()].sort((a, b) => a.label.localeCompare(b.label)),
      items: members.map((m) => ({ slug: m.slug, title: m.title })),
    }
  })
}

/** Spec 121 (public): published paths. */
export const pathRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const rows = db.select().from(learningPath).where(eq(learningPath.status, 'published')).orderBy(asc(learningPath.title)).all()
    return c.json<{ paths: PublicPath[] }>({ paths: toPublic(rows) })
  })
  .get('/:slug', (c) => {
    const found = db
      .select()
      .from(learningPath)
      .where(and(eq(learningPath.slug, c.req.param('slug')), eq(learningPath.status, 'published')))
      .get()
    if (!found) throw new HTTPException(404, { message: 'Path not found' })
    return c.json<PublicPath>(toPublic([found])[0]!)
  })

/** Spec 123: the signed-in user's paths with their progress. */
export const myPathRoutes = new Hono<AppEnv>().use(requireAuth).get('/', (c) => {
  const me = c.get('user')!
  const enrollments = db
    .select({ path: learningPath, enrolledAt: pathEnrollment.createdAt })
    .from(pathEnrollment)
    .innerJoin(learningPath, eq(learningPath.id, pathEnrollment.pathId))
    .where(and(eq(pathEnrollment.userId, me.id), inArray(learningPath.status, ['published'])))
    .orderBy(asc(learningPath.title))
    .all()
  const paths = toPublic(enrollments.map((e) => e.path))
  const items = pathItems(enrollments.map((e) => e.path.id))
  return c.json<{ paths: MyPath[] }>({
    paths: enrollments.map((e, i) => {
      const progress = pathProgress(me.id, e.path.kind, items.get(e.path.id) ?? [])
      return {
        ...paths[i]!,
        enrolledAt: e.enrolledAt.toISOString(),
        progress,
        completed: progress.filter((p) => p.status === 'completed').length,
      }
    }),
  })
})
