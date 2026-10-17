import { type AdminPath, pathInputSchema, pathUpdateSchema } from '@pupitre/shared'
import { asc, like, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { learningPath } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { audit } from '../../services/audit.ts'
import {
  createPath,
  deletePath,
  enrollInPath,
  enrollmentCounts,
  pathEnrollmentRows,
  pathItems,
  requirePath,
  requireUser,
  toAdminPath,
  unenrollFromPath,
  updatePath,
} from '../../services/paths.ts'

function adminPath(id: string): AdminPath {
  const p = requirePath({ id })
  return toAdminPath(p, pathItems([p.id]).get(p.id) ?? [], enrollmentCounts([p.id]).get(p.id) ?? 0)
}

/** Specs 126, 127 and 122, under /api/admin/paths. */
export const adminPathRoutes = new Hono<AppEnv>()
  .get('/', validate('query', z.object({ search: z.string().optional() })), (c) => {
    const term = c.req.valid('query').search?.trim()
    const pattern = `%${term ?? ''}%`
    const rows = db
      .select()
      .from(learningPath)
      .where(term ? or(like(learningPath.title, pattern), like(learningPath.slug, pattern)) : undefined)
      .orderBy(asc(learningPath.title))
      .all()
    const items = pathItems(rows.map((r) => r.id))
    const counts = enrollmentCounts(rows.map((r) => r.id))
    return c.json<{ paths: AdminPath[] }>({
      paths: rows.map((p) => toAdminPath(p, items.get(p.id) ?? [], counts.get(p.id) ?? 0)),
    })
  })
  .post('/', validate('json', pathInputSchema), (c) => {
    const created = createPath(c.req.valid('json'))
    audit(c.get('user'), 'path.create', { type: 'path', id: created.id, label: created.slug })
    return c.json<AdminPath>(adminPath(created.id), 201)
  })
  .get('/:id', (c) => c.json<AdminPath>(adminPath(c.req.param('id'))))
  .patch('/:id', validate('json', pathUpdateSchema), (c) => {
    const found = requirePath({ id: c.req.param('id') })
    updatePath(found.id, c.req.valid('json'), c.get('user')!.id)
    audit(c.get('user'), 'path.update', { type: 'path', id: found.id, label: found.slug })
    return c.json<AdminPath>(adminPath(found.id))
  })
  .delete('/:id', (c) => {
    const found = requirePath({ id: c.req.param('id') })
    deletePath(found.id)
    audit(c.get('user'), 'path.delete', { type: 'path', id: found.id, label: found.slug })
    return c.json({ message: 'Path deleted' })
  })
  .get('/:id/enrollments', (c) => {
    const found = requirePath({ id: c.req.param('id') })
    return c.json({ users: pathEnrollmentRows(found) })
  })
  .post('/:id/enrollments', validate('json', z.object({ userId: z.string().min(1) })), (c) => {
    const found = requirePath({ id: c.req.param('id') })
    const target = requireUser(c.req.valid('json').userId)
    enrollInPath(found.id, target.id, c.get('user')!.id)
    return c.json({ message: 'User enrolled' })
  })
  .delete('/:id/enrollments/:userId', (c) => {
    const found = requirePath({ id: c.req.param('id') })
    unenrollFromPath(found.id, c.req.param('userId'))
    return c.json({ message: 'User unenrolled' })
  })
