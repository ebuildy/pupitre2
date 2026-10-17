import type { AdminModule, CourseModulesInput } from '@pupitre/shared'
import { courseModulesSchema } from '@pupitre/shared'
import { eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import { db } from '../db/index.ts'
import { courseModule, modulePrerequisite, moduleSkill } from '../db/schema/index.ts'
import { parse as parseYaml } from 'yaml'
import { contentLoader, ContentUnavailableError } from '../content/loader.ts'
import { slugify } from '../content/markdown-course.ts'
import { InvalidQuizError, loadModules, parseQuiz } from './learning.ts'
import { ensureSkills, moduleSkills } from './skills.ts'

type ParsedModules = z.output<typeof courseModulesSchema>['modules']

export async function adminModules(courseId: string): Promise<AdminModule[]> {
  const { modules, prerequisites } = await loadModules(courseId)
  const slugById = new Map(modules.map((m) => [m.id, m.slug]))
  const skills = moduleSkills(modules.map((m) => m.id))
  return modules.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    type: m.type,
    hidden: m.hidden,
    inline: m.inline,
    prerequisites: (prerequisites.get(m.id) ?? []).map((id) => slugById.get(id)!),
    skills: (skills.get(m.id) ?? []).map((sk) => sk.slug),
    content: m.mediaUrl
      ? { kind: 'media', url: m.mediaUrl, replicate: m.mediaReplicate }
      : m.sourceRepo && m.sourcePath
        ? { kind: 'source', repo: m.sourceRepo, ref: m.sourceRef ?? 'main', path: m.sourcePath }
        : { kind: 'inline', body: m.body ?? '' },
  }))
}

const INDEX_ENTRY_TYPES = ['text', 'quiz', 'video', 'image'] as const

/**
 * Spec 065 / 191: a `modules` entry points to a YAML index in a repository (a list, or `{modules: [...]}`, of
 * `{name, path, type?, src?, ref?, hidden?, prerequisites?, skills?, slug?, inline?}`; `src` / `ref` default to the
 * index's). It is replaced by those modules, which become real modules with their own identity (progress is kept on
 * them). An unreadable or invalid index is refused (400).
 */
export async function expandModuleIndexes(modules: ParsedModules): Promise<ParsedModules> {
  if (!modules.some((m) => m.type === 'modules')) return modules
  const used = new Set(modules.filter((m) => m.type !== 'modules').map((m) => m.slug))
  const out: ParsedModules = []
  for (const m of modules) {
    if (m.type !== 'modules' || m.content.kind !== 'source') {
      out.push(m)
      continue
    }
    const index = m.content
    let doc: unknown
    try {
      doc = parseYaml(await contentLoader.read(index))
    } catch (err) {
      const reason = err instanceof ContentUnavailableError ? 'file unavailable' : (err as Error).message
      throw new HTTPException(400, { message: `Module index "${m.name}": ${reason}` })
    }
    const entries = (Array.isArray(doc) ? doc : (doc as { modules?: unknown })?.modules) as Record<string, unknown>[] | undefined
    if (!Array.isArray(entries)) throw new HTTPException(400, { message: `Module index "${m.name}": expected a list of modules` })
    entries.forEach((e, i) => {
      const name = typeof e?.name === 'string' ? e.name.trim() : ''
      const path = typeof e?.path === 'string' ? e.path.trim() : ''
      const type = (e?.type ?? 'text') as (typeof INDEX_ENTRY_TYPES)[number]
      if (!name || !path || !INDEX_ENTRY_TYPES.includes(type)) {
        throw new HTTPException(400, { message: `Module index "${m.name}": entry ${i + 1} needs a name, a path and a valid type` })
      }
      const base = typeof e.slug === 'string' ? e.slug : slugify(name) || 'module'
      let slug = base
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
      used.add(slug)
      out.push({
        slug,
        name,
        type,
        hidden: e.hidden === true || m.hidden,
        inline: e.inline === true,
        prerequisites: Array.isArray(e.prerequisites) ? (e.prerequisites as string[]) : [],
        skills: Array.isArray(e.skills) ? (e.skills as string[]) : m.skills,
        content: {
          kind: 'source',
          repo: typeof e.src === 'string' ? e.src : index.repo,
          ref: typeof e.ref === 'string' ? e.ref : index.ref,
          path,
        },
      })
    })
  }
  return courseModulesSchema.parse({ modules: out }).modules
}

/** Expands module indexes, then replaces the course's modules. */
export async function saveModules(courseId: string, modules: ParsedModules) {
  replaceModules(courseId, await expandModuleIndexes(modules))
}

/**
 * Replaces a course's module list (spec 169 style). Modules are matched by slug: kept ones keep their id, so
 * progress, submissions and attempt states stay attached; removed ones are deleted with their progress (spec 191
 * lifecycle). Quizzes written in the platform are validated first.
 */
export function replaceModules(courseId: string, modules: ParsedModules) {
  if (modules.some((m) => m.type === 'modules')) throw new Error('Module indexes must be expanded first (saveModules)')
  modules.forEach((m, i) => {
    if (m.type === 'quiz' && m.content.kind === 'inline') {
      try {
        parseQuiz(m.content.body)
      } catch (err) {
        if (err instanceof InvalidQuizError) {
          throw new HTTPException(400, { message: `modules.${i} (${m.slug}): ${err.message}` })
        }
        throw err
      }
    }
  })

  db.transaction((tx) => {
    const existing = new Map(
      tx.select({ id: courseModule.id, slug: courseModule.slug }).from(courseModule).where(eq(courseModule.courseId, courseId)).all()
        .map((r) => [r.slug, r.id]),
    )
    const ids = new Map<string, string>()
    modules.forEach((m, position) => {
      const values = {
        courseId,
        position,
        slug: m.slug,
        name: m.name,
        type: m.type as Exclude<typeof m.type, 'modules'>,
        hidden: m.hidden,
        inline: m.inline,
        body: m.content.kind === 'inline' ? m.content.body : null,
        sourceRepo: m.content.kind === 'source' ? m.content.repo : null,
        sourceRef: m.content.kind === 'source' ? m.content.ref : null,
        sourcePath: m.content.kind === 'source' ? m.content.path : null,
        mediaUrl: m.content.kind === 'media' ? m.content.url : null,
        mediaReplicate: m.content.kind === 'media' ? m.content.replicate : false,
      }
      const id = existing.get(m.slug)
      if (id) {
        tx.update(courseModule).set(values).where(eq(courseModule.id, id)).run()
        ids.set(m.slug, id)
      } else {
        ids.set(m.slug, tx.insert(courseModule).values(values).returning({ id: courseModule.id }).get()!.id)
      }
    })

    const removed = [...existing].filter(([slug]) => !ids.has(slug)).map(([, id]) => id)
    if (removed.length) tx.delete(courseModule).where(inArray(courseModule.id, removed)).run()

    const allIds = [...ids.values()]
    if (allIds.length) tx.delete(modulePrerequisite).where(inArray(modulePrerequisite.moduleId, allIds)).run()
    const links = modules.flatMap((m) => m.prerequisites.map((p) => ({ moduleId: ids.get(m.slug)!, requiresModuleId: ids.get(p)! })))
    if (links.length) tx.insert(modulePrerequisite).values(links).run()

    // Spec 110: skills, created on the fly.
    if (allIds.length) tx.delete(moduleSkill).where(inArray(moduleSkill.moduleId, allIds)).run()
    const skillIds = ensureSkills(modules.flatMap((m) => m.skills), tx)
    const skillLinks = modules.flatMap((m) =>
      [...new Set(m.skills)].map((slug) => ({ moduleId: ids.get(m.slug)!, skillId: skillIds.get(slug)! })),
    )
    if (skillLinks.length) tx.insert(moduleSkill).values(skillLinks).run()
  })
}

export type { CourseModulesInput }
