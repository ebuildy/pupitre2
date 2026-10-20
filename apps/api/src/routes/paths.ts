import { myPathSchema, type PublicPath, publicPathSchema, type SkillRef } from '@pupitre/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { learningPath, pathEnrollment } from '../db/schema/index.ts'
import { $, createRoute, createRouter, errors, json, params, PUBLIC } from '../lib/openapi.ts'
import { requireAuth } from '../middleware/session.ts'
import { completedItems, type LearningPath, pathItems, pathProgress } from '../services/paths.ts'
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

const listPaths = createRoute({
  method: 'get',
  path: '/',
  tags: ['Learning paths'],
  security: PUBLIC,
  summary: 'Learning paths',
  description: 'Spec 121: published paths.',
  responses: { 200: json(z.object({ paths: z.array(publicPathSchema) })) },
})

const getPath = createRoute({
  method: 'get',
  path: '/{slug}',
  tags: ['Learning paths'],
  security: PUBLIC,
  summary: 'A learning path',
  request: { params: params('slug') },
  responses: { 200: json(publicPathSchema), ...errors(404) },
})

/** Spec 121 (public): published paths. */
export const pathRoutes = createRouter()
  .openapi(listPaths, (c) => {
    const rows = db.select().from(learningPath).where(eq(learningPath.status, 'published')).orderBy(asc(learningPath.title)).all()
    return c.json({ paths: toPublic(rows) }, 200)
  })
  .openapi(getPath, (c) => {
    const found = db
      .select()
      .from(learningPath)
      .where(and(eq(learningPath.slug, c.req.param('slug')), eq(learningPath.status, 'published')))
      .get()
    if (!found) throw new HTTPException(404, { message: 'Path not found' })
    return c.json(toPublic([found])[0]!, 200)
  })

const getMyPaths = createRoute({
  method: 'get',
  path: '/',
  tags: ['Me'],
  summary: 'My learning paths',
  description: "Spec 123: the signed-in user's published paths, with their progress.",
  responses: { 200: json(z.object({ paths: z.array(myPathSchema) })), ...errors(401) },
})

/** Spec 123: the signed-in user's paths with their progress. */
export const myPathRoutes = $(createRouter().use(requireAuth)).openapi(getMyPaths, (c) => {
  const me = c.get('user')
  const enrollments = db
    .select({ path: learningPath, enrolledAt: pathEnrollment.createdAt })
    .from(pathEnrollment)
    .innerJoin(learningPath, eq(learningPath.id, pathEnrollment.pathId))
    .where(and(eq(pathEnrollment.userId, me.id), inArray(learningPath.status, ['published'])))
    .orderBy(asc(learningPath.title))
    .all()
  const paths = toPublic(enrollments.map((e) => e.path))
  const items = pathItems(enrollments.map((e) => e.path.id))
  const done = completedItems([me.id], [...items.values()].flat()).get(me.id)!
  return c.json({
    paths: enrollments.map((e, i) => {
      const progress = pathProgress(done, items.get(e.path.id) ?? [])
      return {
        ...paths[i]!,
        enrolledAt: e.enrolledAt.toISOString(),
        progress,
        completed: progress.filter((p) => p.status === 'completed').length,
      }
    }),
  }, 200)
})
