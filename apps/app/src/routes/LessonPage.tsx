import { useTranslation } from '@pupitre/i18n'
import { ApiRequestError, cn, EmptyState, ErrorState, isNotFound, LoadingState } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Button } from '@pupitre/ui/components/ui/button'
import { Progress } from '@pupitre/ui/components/ui/progress'
import { CheckIcon, ChevronRightIcon, Columns3Icon, LockIcon, MaximizeIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { QuizForm } from '../components/quiz/QuizForm.tsx'
import { completeModule, moduleHref, useCourseModules, useModule, useRefreshLearning } from '../lib/learning.ts'
import { useMermaid } from '../lib/mermaid.ts'

type ReadingMode = 'docs' | 'focus'
const READING_MODE_KEY = 'pupitre.readingMode'

function storedReadingMode(): ReadingMode {
  try {
    return localStorage.getItem(READING_MODE_KEY) === 'focus' ? 'focus' : 'docs'
  } catch {
    return 'docs'
  }
}

/**
 * Specs 056, 057, 067, 083: module tree, content, table of contents, previous/next, the inline mini-quiz, and the
 * reading mode ("docs": 3 columns; "focus": content only, centred; remembered in localStorage).
 */
export function LessonPage() {
  const { slug = '', moduleSlug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const refresh = useRefreshLearning(slug)
  const { data: detail, isPending, error } = useModule(slug, moduleSlug)
  const { data: list } = useCourseModules(slug)
  const contentRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ReadingMode>(storedReadingMode)
  function toggleMode() {
    const next = mode === 'docs' ? 'focus' : 'docs'
    setMode(next)
    try {
      localStorage.setItem(READING_MODE_KEY, next)
    } catch {}
  }
  useMermaid(contentRef, detail?.lesson?.html)

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

  if (isPending) return <LoadingState label={t('lesson.loading')} rows={6} />
  if (error) {
    // A locked module sends back to the course page (spec 054).
    if (error instanceof ApiRequestError && error.status === 403) return <Navigate to={`/courses/${slug}`} replace />
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('lesson.notFound') : error.message}</h1>
        <Button asChild variant="outline">
          <Link to="/courses">{t('common:backToCatalogue')}</Link>
        </Button>
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
  const main = list?.modules.filter((m) => !m.inline) ?? []

  return (
    <div
      className={cn(
        'grid gap-8',
        mode === 'docs' ? 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]' : 'mx-auto max-w-3xl',
      )}
      data-reading-mode={mode}
    >
      <Button
        variant="outline"
        size="sm"
        className="fixed right-4 bottom-4 z-30 shadow-md"
        onClick={toggleMode}
        title={mode === 'docs' ? t('lesson.focusModeHelp') : t('lesson.docsModeHelp')}
      >
        {mode === 'docs' ? <MaximizeIcon /> : <Columns3Icon />}
        {mode === 'docs' ? t('lesson.focusMode') : t('lesson.docsMode')}
      </Button>
      {mode === 'docs' && (
        <aside className="hidden flex-col gap-3 self-start lg:sticky lg:top-32 lg:flex" aria-label={t('lesson.modules')}>
          <h2 className="text-sm font-semibold">{t('lesson.modules')}</h2>
          {list && (
            <div className="flex flex-col gap-1.5">
              <Progress value={list.progress.total ? (list.progress.done / list.progress.total) * 100 : 0} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {t('course.progress', { done: list.progress.done, total: list.progress.total })}
              </p>
            </div>
          )}
          <ol className="flex flex-col gap-0.5 text-sm">
            {main.map((m) => (
              <li key={m.slug}>
                {m.locked ? (
                  <span className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                    <LockIcon className="size-3.5 shrink-0" /> {m.name}
                  </span>
                ) : (
                  <Link
                    to={moduleHref(slug, m)}
                    aria-current={m.slug === moduleSlug ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                      m.slug === moduleSlug ? 'bg-secondary font-medium text-secondary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <span className="flex w-3.5 shrink-0 justify-center text-success">{m.done ? <CheckIcon className="size-3.5" /> : null}</span>
                    {m.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </aside>
      )}

      <article className="flex min-w-0 flex-col gap-6">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="breadcrumb">
          <Link to="/courses" className="hover:text-foreground">
            {t('nav.catalogue')}
          </Link>
          <ChevronRightIcon className="size-3.5" />
          <Link to={`/courses/${slug}`} className="hover:text-foreground">
            {slug}
          </Link>
          <ChevronRightIcon className="size-3.5" />
          <span className="text-foreground">{detail.name}</span>
        </nav>

        {detail.media ? (
          detail.type === 'video' ? (
            <video controls preload="metadata" className="w-full rounded-xl bg-black" data-testid="module-video">
              <source src={detail.media.url} />
            </video>
          ) : (
            <img src={detail.media.url} alt={detail.name} className="w-full rounded-xl" data-testid="module-image" />
          )
        ) : detail.lesson?.unavailable ? (
          <Alert variant="warning">
            <AlertDescription className="text-current">{t('lesson.unavailable')}</AlertDescription>
          </Alert>
        ) : detail.lesson?.html ? (
          <>
          {/* Spec 061: CSS of the markdown patterns used by this lesson. */}
          {detail.lesson.styles && <style>{detail.lesson.styles}</style>}
          <div
            ref={contentRef}
            className="content prose prose-neutral max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-primary"
            data-testid="lesson-content"
            dangerouslySetInnerHTML={{ __html: detail.lesson.html }}
          />
          </>
        ) : (
          <EmptyState title={t('lesson.empty')} />
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

        <div className="flex flex-col gap-2 border-t pt-5">
          {isLast && inlinePending && <p className="text-sm text-xp">{t('lesson.pendingInlineQuiz')}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline">
              <Link to={detail.previous ? moduleHref(slug, detail.previous) : `/courses/${slug}`}>
                {detail.previous ? t('lesson.previous') : t('lesson.backToCourse')}
              </Link>
            </Button>
            {!detail.done || isLast ? (
              <Button disabled={complete.isPending} onClick={() => complete.mutate()}>
                {nextLabel}
              </Button>
            ) : (
              <Button asChild>
                <Link to={moduleHref(slug, detail.next!)}>{nextLabel}</Link>
              </Button>
            )}
          </div>
          {complete.isError && <ErrorState message={t('lesson.updateError')} />}
        </div>
      </article>

      {mode === 'docs' && detail.lesson && detail.lesson.toc.length > 0 && (
        <aside className="hidden self-start xl:sticky xl:top-32 xl:block" aria-label={t('lesson.toc')}>
          <h2 className="mb-2 text-sm font-semibold">{t('lesson.toc')}</h2>
          <ul className="flex flex-col gap-1 border-l text-sm">
            {detail.lesson.toc.map((entry) => (
              <li key={entry.id} className={entry.level === 3 ? 'pl-6' : 'pl-3'}>
                <a href={`#${entry.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
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
