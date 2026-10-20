import { type AdminPath, adminPathSchema, messageSchema, pathEnrollmentRowSchema, pathInputSchema, pathUpdateSchema } from '@pupitre/shared'
import { asc, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { learningPath } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
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

const tags = ['Admin: paths']

const listPaths = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Learning paths',
  description: 'Spec 126; `search` matches the title or the slug.',
  request: { query: z.object({ search: z.string().optional() }) },
  responses: { 200: json(z.object({ paths: z.array(adminPathSchema) })), ...errors(400, ...ADMIN) },
})

const addPath = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Create a learning path',
  description: 'Spec 127: `items` are course ids (course paths) or skill slugs (skill paths), in order.',
  request: { body: jsonBody(pathInputSchema) },
  responses: { 201: json(adminPathSchema, 'Created'), ...errors(400, ...ADMIN, 409) },
})

const getPath = createRoute({
  method: 'get',
  path: '/{id}',
  tags,
  summary: 'A learning path',
  request: { params: params('id') },
  responses: { 200: json(adminPathSchema), ...errors(...ADMIN, 404) },
})

const editPath = createRoute({
  method: 'patch',
  path: '/{id}',
  tags,
  summary: 'Edit a learning path',
  request: { params: params('id'), body: jsonBody(pathUpdateSchema) },
  responses: { 200: json(adminPathSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const removePath = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a learning path',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

const listEnrollments = createRoute({
  method: 'get',
  path: '/{id}/enrollments',
  tags,
  summary: 'Users enrolled in a path',
  description: 'Spec 122: with their progress.',
  request: { params: params('id') },
  responses: { 200: json(z.object({ users: z.array(pathEnrollmentRowSchema) })), ...errors(...ADMIN, 404) },
})

const enroll = createRoute({
  method: 'post',
  path: '/{id}/enrollments',
  tags,
  summary: 'Enroll a user in a path',
  description: 'The user gets access to the courses of the path.',
  request: { params: params('id'), body: jsonBody(z.object({ userId: z.string().min(1) })) },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const unenroll = createRoute({
  method: 'delete',
  path: '/{id}/enrollments/{userId}',
  tags,
  summary: 'Withdraw a user from a path',
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

/** Specs 126, 127 and 122, under /api/admin/paths. */
export const adminPathRoutes = createRouter()
  .openapi(listPaths, (c) => {
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
    return c.json({
      paths: rows.map((p) => toAdminPath(p, items.get(p.id) ?? [], counts.get(p.id) ?? 0)),
    }, 200)
  })
  .openapi(addPath, (c) => {
    const created = createPath(c.req.valid('json'))
    audit(c.get('user'), 'path.create', { type: 'path', id: created.id, label: created.slug })
    return c.json(adminPath(created.id), 201)
  })
  .openapi(getPath, (c) => c.json(adminPath(c.req.param('id')), 200))
  .openapi(editPath, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    updatePath(found.id, c.req.valid('json'), c.get('user')!.id)
    audit(c.get('user'), 'path.update', { type: 'path', id: found.id, label: found.slug })
    return c.json(adminPath(found.id), 200)
  })
  .openapi(removePath, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    deletePath(found.id)
    audit(c.get('user'), 'path.delete', { type: 'path', id: found.id, label: found.slug })
    return c.json({ message: 'Path deleted' }, 200)
  })
  .openapi(listEnrollments, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    return c.json({ users: pathEnrollmentRows(found) }, 200)
  })
  .openapi(enroll, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    const target = requireUser(c.req.valid('json').userId)
    enrollInPath(found.id, target.id, c.get('user')!.id)
    return c.json({ message: 'User enrolled' }, 200)
  })
  .openapi(unenroll, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    unenrollFromPath(found.id, c.req.param('userId'))
    return c.json({ message: 'User unenrolled' }, 200)
  })
