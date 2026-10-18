import { useTranslation } from '@pupitre/i18n'
import { ApiRequestError, isNotFound, LoadingState, PageHeader } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { ChevronRightIcon } from 'lucide-react'
import { afterCourseCompleted, returnPathFor } from '../lib/return-path.ts'
import { Link, Navigate, useParams } from 'react-router'
import { QuizForm } from '../components/quiz/QuizForm.tsx'
import { moduleHref, useModule, useRefreshLearning } from '../lib/learning.ts'

/** Spec 082: the full quiz page. */
export function QuizPage() {
  const { slug = '', moduleSlug = '' } = useParams()
  const { t } = useTranslation(['app', 'common'])
  const refresh = useRefreshLearning(slug)
  const { data: detail, isPending, error } = useModule(slug, moduleSlug)

  if (isPending) return <LoadingState label={t('quiz.loading')} />
  if (error) {
    if (error instanceof ApiRequestError && error.status === 403) return <Navigate to={`/courses/${slug}`} replace />
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{isNotFound(error) ? t('quiz.notFound') : error.message}</h1>
        <Button asChild variant="outline">
          <Link to="/courses">{t('common:backToCatalogue')}</Link>
        </Button>
      </div>
    )
  }
  if (detail.hostSlug) return <Navigate to={`/courses/${slug}/lessons/${detail.hostSlug}`} replace />
  if (detail.type !== 'quiz' || !detail.quiz) return <Navigate to={moduleHref(slug, detail)} replace />

  return (
    <div className="flex flex-col gap-6">
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
      <PageHeader title={detail.quiz.title ?? detail.name} description={t('quiz.questionsCount', { count: detail.quiz.questions.length })} />
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
              <p className="w-full font-medium text-success-foreground">{t('lesson.courseCompleted')}</p>
            )}
            {result.courseCompleted && returnPathFor(slug) && (
              <Button asChild>
                {/* Rendering must not forget the target: it is cleared on click. */}
                <Link to={returnPathFor(slug)!.to} onClick={() => afterCourseCompleted(slug)}>
                  {t('myPaths.backToPath', { title: returnPathFor(slug)!.title })}
                </Link>
              </Button>
            )}
            {result.passed && detail.next && (
              <Button asChild>
                <Link to={moduleHref(slug, detail.next)}>{t('quiz.nextModule')}</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to={`/courses/${slug}`}>{t('quiz.backToCourse')}</Link>
            </Button>
          </>
        )}
      />
    </div>
  )
}
