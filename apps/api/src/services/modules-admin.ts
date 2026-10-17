import type { AdminModule, CourseModulesInput } from '@pupitre/shared'
import { courseModulesSchema } from '@pupitre/shared'
import { eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import { db } from '../db/index.ts'
import { courseModule, modulePrerequisite, moduleSkill } from '../db/schema/index.ts'
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
    content:
      m.sourceRepo && m.sourcePath
        ? { kind: 'source', repo: m.sourceRepo, ref: m.sourceRef ?? 'main', path: m.sourcePath }
        : { kind: 'inline', body: m.body ?? '' },
  }))
}

/**
 * Replaces a course's module list (spec 169 style). Modules are matched by slug: kept ones keep their id, so
 * progress, submissions and attempt states stay attached; removed ones are deleted with their progress (spec 191
 * lifecycle). Quizzes written in the platform are validated first.
 */
export function replaceModules(courseId: string, modules: ParsedModules) {
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
        type: m.type,
        hidden: m.hidden,
        inline: m.inline,
        body: m.content.kind === 'inline' ? m.content.body : null,
        sourceRepo: m.content.kind === 'source' ? m.content.repo : null,
        sourceRef: m.content.kind === 'source' ? m.content.ref : null,
        sourcePath: m.content.kind === 'source' ? m.content.path : null,
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
