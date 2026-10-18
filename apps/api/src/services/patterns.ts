import { existsSync, readFileSync } from 'node:fs'
import { type MarkdownPattern, patternInputSchema } from '@pupitre/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { parse as parseYaml } from 'yaml'
import type { PatternDef } from '../content/markdown.ts'
import { db } from '../db/index.ts'
import { course, markdownPattern } from '../db/schema/index.ts'

type Row = typeof markdownPattern.$inferSelect

/** Spec 061: the patterns a course's lessons may use — global ones, overridden by the course's own. */
export function patternsFor(courseId: string): PatternDef[] {
  const rows = db
    .select({ name: markdownPattern.name, html: markdownPattern.html, css: markdownPattern.css, scope: markdownPattern.scope })
    .from(markdownPattern)
    .where(inArray(markdownPattern.scope, ['', courseId]))
    .all()
  const byName = new Map<string, PatternDef>()
  for (const r of rows.sort((a, b) => a.scope.length - b.scope.length)) byName.set(r.name, { name: r.name, html: r.html, css: r.css })
  return [...byName.values()]
}

export function listPatterns(): MarkdownPattern[] {
  const rows = db
    .select({ p: markdownPattern, c: { id: course.id, slug: course.slug, title: course.title } })
    .from(markdownPattern)
    .leftJoin(course, eq(course.id, markdownPattern.courseId))
    .orderBy(asc(markdownPattern.name))
    .all()
  return rows.map(({ p, c }) => toView(p, c?.id ? c : null))
}

function toView(p: Row, c: MarkdownPattern['course']): MarkdownPattern {
  return {
    id: p.id,
    name: p.name,
    label: p.label,
    description: p.description,
    parameter: p.parameter,
    html: p.html,
    css: p.css,
    course: c,
    origin: p.origin,
    updatedAt: p.updatedAt.toISOString(),
  }
}

function duplicate(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: markdown_pattern/.test(String(err.cause ?? err.message))
}

function checkCourse(courseId: string | null | undefined) {
  if (courseId && !db.select({ id: course.id }).from(course).where(eq(course.id, courseId)).get()) {
    throw new HTTPException(400, { message: 'Unknown course' })
  }
}

export function savePattern(input: ReturnType<typeof patternInputSchema.parse>, actorId: string | null, id?: string) {
  checkCourse(input.courseId)
  const values = { ...input, courseId: input.courseId ?? null, scope: input.courseId ?? '' }
  try {
    if (id) {
      const updated = db.update(markdownPattern).set(values).where(eq(markdownPattern.id, id)).returning().get()
      if (!updated) throw new HTTPException(404, { message: 'Pattern not found' })
      return updated
    }
    return db.insert(markdownPattern).values({ ...values, createdBy: actorId }).returning().get()!
  } catch (err) {
    if (duplicate(err)) throw new HTTPException(409, { message: 'A pattern with this name already exists in this scope' })
    throw err
  }
}

/** Spec 181: patterns from `PATTERNS_FILE` (YAML list), upserted by name in the global scope, marked `config`. */
export function seedPatterns(file: string | undefined) {
  if (!file || !existsSync(file)) return 0
  const doc = parseYaml(readFileSync(file, 'utf8')) as unknown
  const list = (Array.isArray(doc) ? doc : (doc as { patterns?: unknown[] })?.patterns) ?? []
  let n = 0
  for (const raw of list) {
    const input = patternInputSchema.parse(raw)
    const values = { ...input, courseId: null, scope: '', origin: 'config' as const }
    db.insert(markdownPattern)
      .values(values)
      .onConflictDoUpdate({ target: [markdownPattern.scope, markdownPattern.name], set: values })
      .run()
    n++
  }
  return n
}
