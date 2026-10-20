import { markdownPatternSchema, messageSchema, patternInputSchema, patternPreviewSchema } from '@pupitre/shared'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { renderMarkdown } from '../../content/markdown.ts'
import { db } from '../../db/index.ts'
import { markdownPattern } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
import { listPatterns, savePattern } from '../../services/patterns.ts'

const byId = (id: string) => listPatterns().find((p) => p.id === id)!

const tags = ['Admin: patterns']

const listAll = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Markdown patterns',
  description: 'Spec 180: reusable rendering components, used in markdown as `|||name … |||`.',
  responses: { 200: json(z.object({ patterns: z.array(markdownPatternSchema) })), ...errors(...ADMIN) },
})

const createPattern = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Create a pattern',
  request: { body: jsonBody(patternInputSchema) },
  responses: { 201: json(markdownPatternSchema, 'Created'), ...errors(400, ...ADMIN, 409) },
})

const updatePattern = createRoute({
  method: 'put',
  path: '/{id}',
  tags,
  summary: 'Replace a pattern',
  request: { params: params('id'), body: jsonBody(patternInputSchema) },
  responses: { 200: json(markdownPatternSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const deletePattern = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a pattern',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

const previewPattern = createRoute({
  method: 'post',
  path: '/preview',
  tags,
  summary: 'Preview markdown',
  description: 'Rendered with the global patterns, or with one pattern being edited.',
  request: { body: jsonBody(patternPreviewSchema) },
  responses: { 200: json(z.object({ html: z.string(), styles: z.string() })), ...errors(400, ...ADMIN) },
})

/** Spec 180, under /api/admin/patterns. */
export const adminPatternRoutes = createRouter()
  .openapi(listAll, (c) => c.json({ patterns: listPatterns() }, 200))
  .openapi(createPattern, (c) => {
    const created = savePattern(c.req.valid('json'), c.get('user')!.id)
    return c.json(byId(created.id), 201)
  })
  .openapi(updatePattern, (c) => {
    const updated = savePattern(c.req.valid('json'), c.get('user')!.id, c.req.param('id'))
    return c.json(byId(updated.id), 200)
  })
  .openapi(deletePattern, (c) => {
    const removed = db.delete(markdownPattern).where(eq(markdownPattern.id, c.req.param('id'))).run()
    if (removed.changes === 0) throw new HTTPException(404, { message: 'Pattern not found' })
    return c.json({ message: 'Pattern deleted' }, 200)
  })
  /** Live preview: markdown rendered with the global patterns, or with one pattern being edited. */
  .openapi(previewPattern, (c) => {
    const { markdown, pattern } = c.req.valid('json')
    const patterns = listPatterns()
      .filter((p) => !p.course && p.name !== pattern?.name)
      .map(({ name, html, css }) => ({ name, html, css }))
    if (pattern) patterns.push({ name: pattern.name, html: pattern.html, css: pattern.css ?? null })
    const { html, styles } = renderMarkdown(markdown, patterns)
    return c.json({ html, styles }, 200)
  })
