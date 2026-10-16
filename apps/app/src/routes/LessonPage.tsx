import { useTranslation } from '@pupitre/i18n'
import { ApiRequestError, isNotFound } from '@pupitre/ui'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { QuizForm } from '../components/quiz/QuizForm.tsx'
import { completeModule, moduleHref, useCourseModules, useModule, useRefreshLearning } from '../lib/learning.ts'

/** Specs 056, 067, 083: module tree, content, table of contents, previous/next, and the inline mini-quiz. */
export function LessonPage() {
  const { slug = '', moduleSlug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const refresh = useRefreshLearning(slug)
  const { data: detail, isPending, error } = useModule(slug, moduleSlug)
  const { data: list } = useCourseModules(slug)

  const complete = useMutation({
    mutationFn: () => completeModule(slug, moduleSlug),
    onSuccess: async ({ courseCompleted }) => {
      await refresh()
      if (courseCompleted || !detail?.next) navigate(`/courses/${slug}`, { state: { completed: courseCompleted } })
      else navigate(moduleHref(slug, detail.next))
    },
  })

  // Braces matter: scroll methods may return a Promise, and an effect must return nothing or a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [moduleSlug])

  if (isPending) return <p className="text-zinc-600 dark:text-zinc-400">{t('lesson.loading')}</p>
  if (error) {
    // A locked module sends back to the course page (spec 054).
    if (error instanceof ApiRequestError && error.status === 403) return <Navigate to={`/courses/${slug}`} replace />
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('lesson.notFound') : error.message}</h1>
        <Link to="/courses" className="underline">
          {t('common:backToCatalogue')}
        </Link>
      </div>
    )
  }
  // An inline quiz lives on its host lesson; quizzes have their own page.
  if (detail.hostSlug) return <Navigate to={`/courses/${slug}/lessons/${detail.hostSlug}`} replace />
  if (detail.type === 'quiz') return <Navigate to={moduleHref(slug, detail)} replace />

  const isLast = !detail.next
  const inlinePending = !!detail.inlineQuiz && !detail.inlineQuiz.module.done
  const nextLabel = isLast
    ? inlinePending
      ? t('lesson.finishLesson')
      : t('lesson.finishCourse')
    : detail.next!.type === 'quiz'
      ? t('lesson.nextQuiz')
      : t('lesson.next')
  const button = 'rounded-lg px-4 py-2 font-semibold'
  const main = list?.modules.filter((m) => !m.inline) ?? []

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_12rem]">
      <aside className="hidden flex-col gap-2 self-start lg:sticky lg:top-4 lg:flex" aria-label={t('lesson.modules')}>
        <h2 className="text-sm font-semibold text-zinc-500">{t('lesson.modules')}</h2>
        {list && (
          <p className="text-xs text-zinc-500">{t('course.progress', { done: list.progress.done, total: list.progress.total })}</p>
        )}
        <ol className="flex flex-col gap-1 text-sm">
          {main.map((m) => (
            <li key={m.slug}>
              {m.locked ? (
                <span className="flex gap-2 px-2 py-1 text-zinc-400">🔒 {m.name}</span>
              ) : (
                <Link
                  to={moduleHref(slug, m)}
                  aria-current={m.slug === moduleSlug ? 'page' : undefined}
                  className={`flex gap-2 rounded px-2 py-1 ${m.slug === moduleSlug ? 'bg-zinc-100 font-semibold dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
                >
                  <span className="w-4 text-green-600">{m.done ? '✓' : ''}</span>
                  {m.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </aside>

      <article className="flex min-w-0 flex-col gap-6">
        <nav className="text-sm text-zinc-500" aria-label="breadcrumb">
          <Link to="/courses" className="hover:underline">
            {t('nav.catalogue')}
          </Link>{' '}
          ›{' '}
          <Link to={`/courses/${slug}`} className="hover:underline">
            {slug}
          </Link>{' '}
          › <span>{detail.name}</span>
        </nav>

        {detail.lesson?.unavailable ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t('lesson.unavailable')}</p>
        ) : detail.lesson?.html ? (
          <div
            className="content prose prose-zinc max-w-none dark:prose-invert"
            data-testid="lesson-content"
            dangerouslySetInnerHTML={{ __html: detail.lesson.html }}
          />
        ) : (
          <p className="text-zinc-500">{t('lesson.empty')}</p>
        )}

        {detail.inlineQuiz && (
          <QuizForm
            key={detail.inlineQuiz.module.slug}
            courseSlug={slug}
            moduleSlug={detail.inlineQuiz.module.slug}
            quiz={detail.inlineQuiz.quiz}
            variant="inline"
            onSubmitted={() => refresh()}
          />
        )}

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {isLast && inlinePending && <p className="text-sm text-violet-700 dark:text-violet-300">{t('lesson.pendingInlineQuiz')}</p>}
          <div className="flex items-center justify-between gap-3">
            <Link
              to={detail.previous ? moduleHref(slug, detail.previous) : `/courses/${slug}`}
              className={`${button} border border-zinc-300 dark:border-zinc-700`}
            >
              {detail.previous ? t('lesson.previous') : t('lesson.backToCourse')}
            </Link>
            {!detail.done || isLast ? (
              <button
                type="button"
                disabled={complete.isPending}
                onClick={() => complete.mutate()}
                className={`${button} bg-blue-600 text-white disabled:opacity-60`}
              >
                {nextLabel}
              </button>
            ) : (
              <Link to={moduleHref(slug, detail.next!)} className={`${button} bg-blue-600 text-white`}>
                {nextLabel}
              </Link>
            )}
          </div>
          {complete.isError && (
            <p role="alert" className="text-sm text-red-600">
              {t('lesson.updateError')}
            </p>
          )}
        </div>
      </article>

      {detail.lesson && detail.lesson.toc.length > 0 && (
        <aside className="hidden self-start xl:sticky xl:top-4 xl:block" aria-label={t('lesson.toc')}>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">{t('lesson.toc')}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.lesson.toc.map((entry) => (
              <li key={entry.id} className={entry.level === 3 ? 'pl-3' : ''}>
                <a href={`#${entry.id}`} className="text-zinc-600 hover:underline dark:text-zinc-400">
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}
