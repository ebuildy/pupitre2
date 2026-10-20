import {
  type CourseSpec,
  courseModulesSchema,
  courseSpecSchema,
  markdownImportPreviewSchema,
  markdownImportResultSchema,
  markdownImportSchema,
  type ModuleInput,
} from '@pupitre/shared'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { parseMarkdownCourse } from '../../content/markdown-course.ts'
import { db } from '../../db/index.ts'
import { course } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody } from '../../lib/openapi.ts'
import { audit } from '../../services/audit.ts'
import { readDefinition, writeDefinition } from '../../services/definition.ts'
import { InvalidQuizError, parseQuiz } from '../../services/learning.ts'

/**
 * Specs 174, 175: resolves an import (target course, resulting definition, warnings) without storing anything.
 * create: new course (409 if the slug exists); replace: new modules, and new metadata if the document has a frontmatter;
 * append: modules added after the existing ones, frontmatter ignored.
 */
async function resolveImport(input: ReturnType<typeof markdownImportSchema.parse>) {
  const doc = parseMarkdownCourse(input.markdown, { slug: input.slug || undefined, split: input.split })
  const warnings = [...doc.warnings]
  const existing = db.select().from(course).where(eq(course.slug, doc.slug)).get() ?? null
  let spec: CourseSpec
  let existingSlugs = new Set<string>()

  if (input.mode === 'create') {
    if (existing) throw new HTTPException(409, { message: 'Course already exists' })
    spec = { ...(doc.spec ?? { title: doc.slug }), modules: doc.modules }
  } else {
    if (!existing) throw new HTTPException(404, { message: 'Course not found' })
    const current = (await readDefinition(existing)).spec
    if (input.mode === 'replace') {
      if (doc.spec) warnings.push('The frontmatter replaces the course metadata.')
      spec = { ...(doc.spec ?? current), modules: doc.modules }
    } else {
      if (doc.spec) warnings.push('Frontmatter ignored when appending modules.')
      const kept = current.modules ?? []
      existingSlugs = new Set(kept.map((m) => m.slug))
      // New module slugs never collide with existing ones.
      const added: ModuleInput[] = doc.modules.map((m) => {
        let slug = m.slug
        for (let i = 2; existingSlugs.has(slug); i++) slug = `${m.slug}-${i}`
        return { ...m, slug }
      })
      spec = { ...current, modules: [...kept, ...added] }
    }
  }

  // Same validation as a definition write, so the preview fails where the import would.
  const parsed = courseSpecSchema.parse(spec)
  const modules = courseModulesSchema.parse({ modules: parsed.modules }).modules
  for (const m of modules) {
    if (m.type === 'quiz' && m.content.kind === 'inline') {
      try {
        parseQuiz(m.content.body)
      } catch (err) {
        if (err instanceof InvalidQuizError) throw new HTTPException(400, { message: `Module "${m.name}": ${err.message}` })
        throw err
      }
    }
  }
  return { slug: doc.slug, spec, modules, existing, existingSlugs, warnings }
}

const tags = ['Admin: courses']
const MODES = '`create`: a new course (409 if the slug exists); `replace`: new modules, and new metadata when the document has a frontmatter; `append`: modules added after the existing ones.'

const preview = createRoute({
  method: 'post',
  path: '/preview',
  tags,
  summary: 'Preview a markdown import',
  description: `Spec 175: what the import would do, without storing anything. ${MODES}`,
  request: { body: jsonBody(markdownImportSchema) },
  responses: { 200: json(markdownImportPreviewSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const importCourse = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Import a course from markdown',
  description: `Spec 174. ${MODES}`,
  request: { body: jsonBody(markdownImportSchema) },
  responses: {
    200: json(markdownImportResultSchema, 'Imported into an existing course'),
    201: json(markdownImportResultSchema, 'Course created'),
    ...errors(400, ...ADMIN, 404, 409),
  },
})

/** `/api/admin/courses/import` (spec 174) and `/import/preview` (175). */
export const adminImportRoutes = createRouter()
  .openapi(preview, async (c) => {
    const input = c.req.valid('json')
    const r = await resolveImport(input)
    const { modules: _, ...meta } = r.spec
    return c.json({
      slug: r.slug,
      mode: input.mode,
      course: meta,
      modules: r.modules.map((m) => ({
        name: m.name,
        slug: m.slug,
        type: m.type,
        bytes: m.content.kind === 'inline' ? new TextEncoder().encode(m.content.body).length : 0,
        hidden: m.hidden,
        source: m.content.kind === 'source' ? `${m.content.repo} @ ${m.content.ref} : ${m.content.path}` : null,
        existing: r.existingSlugs.has(m.slug),
      })),
      warnings: r.warnings,
    }, 200)
  })
  .openapi(importCourse, async (c) => {
    const input = c.req.valid('json')
    const r = await resolveImport(input)
    const id = await writeDefinition(r.slug, r.spec, r.existing)
    audit(c.get('user'), `course.import.${input.mode}`, { type: 'course', id, label: r.slug })
    const result = { slug: r.slug, id, mode: input.mode, moduleCount: r.modules.length, warnings: r.warnings }
    return input.mode === 'create' ? c.json(result, 201) : c.json(result, 200)
  })
