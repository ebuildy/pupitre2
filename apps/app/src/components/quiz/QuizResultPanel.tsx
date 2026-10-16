import { useTranslation } from '@pupitre/i18n'
import type { QuestionResult, QuizResult, QuizView } from '@pupitre/shared'
import { cn } from '@pupitre/ui'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { RotateCcwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Spec 078: score, verdict, actions, then the correction with the expected answers and feedback. */
export function QuizResultPanel({
  quiz,
  result,
  variant,
  retryDisabled,
  onRetry,
  actions,
}: {
  quiz: QuizView
  result: QuizResult
  variant: 'full' | 'inline'
  retryDisabled: boolean
  onRetry: () => void
  actions?: ReactNode
}) {
  const { t } = useTranslation('app')
  const percent = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0

  return (
    <section
      className={cn('flex flex-col gap-6', variant === 'inline' && 'rounded-2xl border border-xp/30 bg-xp-soft/40 p-5')}
      data-testid="quiz-result"
    >
      <div className="flex flex-wrap items-center gap-5">
        <div
          className={cn(
            'flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4 bg-card',
            result.passed ? 'border-success text-success-foreground' : 'border-destructive text-destructive',
          )}
        >
          <span className="text-2xl font-bold">{percent} %</span>
          <span className="text-xs">
            {result.score}/{result.maxScore}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">
            {result.passed ? `✓ ${t('quiz.passedTitle')}` : `✗ ${t('quiz.failedTitle')}`}
          </h2>
          <p className="text-muted-foreground">
            {result.passed
              ? t('quiz.passedSubtitle', { score: result.score, max: result.maxScore })
              : t('quiz.failedSubtitle', { percent, passing: result.passingScore })}
          </p>
          <div className="flex gap-2">
            <Badge variant={result.passed ? 'success' : 'destructive'} className={result.passed ? '' : 'bg-destructive/15 text-destructive'}>
              {result.passed ? t('quiz.passedBadge') : t('quiz.failedBadge')}
            </Badge>
            <Badge variant="muted">{t('quiz.scoreBadge', { score: result.score, max: result.maxScore })}</Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!result.passed && (
          <Button type="button" onClick={onRetry} disabled={retryDisabled}>
            <RotateCcwIcon />
            {t('quiz.retry')}
          </Button>
        )}
        {actions}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t('quiz.correction')}</h3>
        <ol className="flex flex-col gap-3">
          {result.questionResults.map((r, i) => {
            const question = quiz.questions.find((q) => q.key === r.key)
            return (
              <li
                key={r.key}
                className={cn('rounded-xl border bg-card p-4', r.correct ? 'border-success/40' : 'border-destructive/40')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2">
                    <span aria-hidden="true" className={r.correct ? 'text-success' : 'text-destructive'}>
                      {r.correct ? '✓' : '✗'}
                    </span>
                    <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                    {question && (
                      <div className="content prose prose-sm max-w-none dark:prose-invert prose-p:my-0" dangerouslySetInnerHTML={{ __html: question.prompt }} />
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('quiz.pointsOf', { earned: r.pointsEarned, max: r.pointsMax })}
                  </span>
                </div>
                {!r.correct && question && <ExpectedAnswer result={r} question={question} />}
                {r.feedback && (
                  <div
                    className="content prose prose-sm mt-2 max-w-none text-muted-foreground dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: r.feedback }}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function ExpectedAnswer({ result, question }: { result: QuestionResult; question: QuizView['questions'][number] }) {
  const { t } = useTranslation('app')
  const options = [...(question.answers ?? []), ...(question.items ?? [])]
  const html = (id: string) => options.find((o) => o.id === id)?.html ?? id
  const expected = result.correctAnswer
  const parts =
    typeof expected === 'boolean'
      ? [expected ? t('quiz.true') : t('quiz.false')]
      : (Array.isArray(expected) ? expected : [expected]).map(html)
  const separator = question.type === 'order' ? ' → ' : ', '

  return (
    <p className="mt-2 text-sm">
      <span className="font-medium">{t('quiz.expected')}</span>{' '}
      <span dangerouslySetInnerHTML={{ __html: parts.join(separator) }} />
    </p>
  )
}
