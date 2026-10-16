import type { CooldownError, ModuleSummary, ModuleType, QuizAnswer, QuizResult } from '@pupitre/shared'
import { ApiRequestError, unwrap } from '@pupitre/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.ts'

/** Lessons and quizzes have their own pages (specs 056, 082). */
export function moduleHref(courseSlug: string, m: { slug: string; type: ModuleType }) {
  return `/courses/${courseSlug}/${m.type === 'quiz' ? 'quiz' : 'lessons'}/${m.slug}`
}

export function useCourseModules(courseSlug: string, enabled = true) {
  return useQuery({
    queryKey: ['modules', courseSlug],
    queryFn: () => unwrap(api.api.courses[':slug'].modules.$get({ param: { slug: courseSlug } })),
    enabled,
  })
}

export function useModule(courseSlug: string, moduleSlug: string) {
  return useQuery({
    queryKey: ['module', courseSlug, moduleSlug],
    queryFn: () =>
      unwrap(api.api.courses[':slug'].modules[':moduleSlug'].$get({ param: { slug: courseSlug, moduleSlug } })),
  })
}

/** Everything that progress can change: module states, course state, "Mes cours", XP. */
export function useRefreshLearning(courseSlug: string) {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all(
      [['modules', courseSlug], ['module', courseSlug], ['course', courseSlug], ['my-courses'], ['my-xp'], ['courses']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    )
  }
}

export async function completeModule(courseSlug: string, moduleSlug: string) {
  return unwrap(
    api.api.courses[':slug'].modules[':moduleSlug'].complete.$post({ param: { slug: courseSlug, moduleSlug } }),
  )
}

/** A submission refused because some questions are still cooling down (425, spec 080). */
export class CooldownActiveError extends Error {
  constructor(readonly body: CooldownError) {
    super(body.error)
  }
}

export async function submitQuiz(courseSlug: string, moduleSlug: string, answers: Record<string, QuizAnswer>) {
  const res = await api.api.courses[':slug'].modules[':moduleSlug'].submit.$post({
    param: { slug: courseSlug, moduleSlug },
    json: { answers },
  })
  if (res.status === 425) throw new CooldownActiveError((await res.json()) as unknown as CooldownError)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiRequestError(res.status, body?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as QuizResult
}

/**
 * Where "Commencer / Continuer le cours" goes (spec 045): the first non-inline module that is not done and not
 * locked, or the lesson hosting a pending inline quiz; the first module when everything is done.
 */
export function nextModule(modules: ModuleSummary[]): ModuleSummary | undefined {
  for (const [i, m] of modules.entries()) {
    if (m.inline || m.locked) continue
    const inlineQuiz = modules[i + 1]?.inline ? modules[i + 1] : undefined
    if (!m.done || (inlineQuiz && !inlineQuiz.done)) return m
  }
  return modules.find((m) => !m.inline)
}
