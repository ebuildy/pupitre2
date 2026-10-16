import { useTranslation } from '@pupitre/i18n'
import { ApiRequestError, isNotFound } from '@pupitre/ui'
import { Link, Navigate, useParams } from 'react-router'
import { QuizForm } from '../components/quiz/QuizForm.tsx'
import { moduleHref, useModule, useRefreshLearning } from '../lib/learning.ts'

/** Spec 082: the full quiz page. */
export function QuizPage() {
  const { slug = '', moduleSlug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const refresh = useRefreshLearning(slug)
  const { data: detail, isPending, error } = useModule(slug, moduleSlug)

  if (isPending) return <p className="text-zinc-600 dark:text-zinc-400">{t('quiz.loading')}</p>
  if (error) {
    if (error instanceof ApiRequestError && error.status === 403) return <Navigate to={`/courses/${slug}`} replace />
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('quiz.notFound') : error.message}</h1>
        <Link to="/courses" className="underline">
          {t('common:backToCatalogue')}
        </Link>
      </div>
    )
  }
  if (detail.hostSlug) return <Navigate to={`/courses/${slug}/lessons/${detail.hostSlug}`} replace />
  if (detail.type !== 'quiz' || !detail.quiz) return <Navigate to={moduleHref(slug, detail)} replace />

  const link = 'rounded-lg border border-zinc-300 px-4 py-2 font-semibold dark:border-zinc-700'

  return (
    <div className="flex flex-col gap-6">
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
      <header>
        <h1 className="text-2xl font-semibold">{detail.quiz.title ?? detail.name}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t('quiz.questionsCount', { count: detail.quiz.questions.length })}</p>
      </header>
      <QuizForm
        key={moduleSlug}
        courseSlug={slug}
        moduleSlug={moduleSlug}
        quiz={detail.quiz}
        variant="full"
        onSubmitted={() => refresh()}
        resultActions={(result) => (
          <>
            {result.courseCompleted && (
              <p className="w-full font-medium text-green-700 dark:text-green-400">{t('lesson.courseCompleted')}</p>
            )}
            {result.passed && detail.next && (
              <Link to={moduleHref(slug, detail.next)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
                {t('quiz.nextModule')}
              </Link>
            )}
            <Link to={`/courses/${slug}`} className={link}>
              {t('quiz.backToCourse')}
            </Link>
          </>
        )}
      />
    </div>
  )
}
