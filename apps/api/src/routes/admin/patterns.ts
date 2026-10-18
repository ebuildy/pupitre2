import { type MarkdownPattern, patternInputSchema, patternPreviewSchema } from '@pupitre/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { renderMarkdown } from '../../content/markdown.ts'
import { db } from '../../db/index.ts'
import { markdownPattern } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { listPatterns, savePattern } from '../../services/patterns.ts'

const byId = (id: string) => listPatterns().find((p) => p.id === id)!

/** Spec 180, under /api/admin/patterns. */
export const adminPatternRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json<{ patterns: MarkdownPattern[] }>({ patterns: listPatterns() }))
  .post('/', validate('json', patternInputSchema), (c) => {
    const created = savePattern(c.req.valid('json'), c.get('user')!.id)
    return c.json<MarkdownPattern>(byId(created.id), 201)
  })
  .put('/:id', validate('json', patternInputSchema), (c) => {
    const updated = savePattern(c.req.valid('json'), c.get('user')!.id, c.req.param('id'))
    return c.json<MarkdownPattern>(byId(updated.id))
  })
  .delete('/:id', (c) => {
    const removed = db.delete(markdownPattern).where(eq(markdownPattern.id, c.req.param('id'))).run()
    if (removed.changes === 0) throw new HTTPException(404, { message: 'Pattern not found' })
    return c.json({ message: 'Pattern deleted' })
  })
  /** Live preview: markdown rendered with the global patterns, or with one pattern being edited. */
  .post('/preview', validate('json', patternPreviewSchema), (c) => {
    const { markdown, pattern } = c.req.valid('json')
    const patterns = listPatterns()
      .filter((p) => !p.course && p.name !== pattern?.name)
      .map(({ name, html, css }) => ({ name, html, css }))
    if (pattern) patterns.push({ name: pattern.name, html: pattern.html, css: pattern.css ?? null })
    const { html, styles } = renderMarkdown(markdown, patterns)
    return c.json({ html, styles })
  })
