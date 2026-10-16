import { useTranslation } from '@pupitre/i18n'
import type { QuestionResult, QuizResult, QuizView } from '@pupitre/shared'
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
      className={`flex flex-col gap-5 ${variant === 'inline' ? 'rounded-2xl border border-violet-200 p-5 dark:border-violet-900' : ''}`}
      data-testid="quiz-result"
    >
      <div className="flex flex-wrap items-center gap-5">
        <div
          className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 ${
            result.passed ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-red-500 text-red-600'
          }`}
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
          <p className="text-zinc-600 dark:text-zinc-400">
            {result.passed
              ? t('quiz.passedSubtitle', { score: result.score, max: result.maxScore })
              : t('quiz.failedSubtitle', { percent, passing: result.passingScore })}
          </p>
          <div className="flex gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                result.passed
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {result.passed ? t('quiz.passedBadge') : t('quiz.failedBadge')}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              {t('quiz.scoreBadge', { score: result.score, max: result.maxScore })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!result.passed && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {t('quiz.retry')}
          </button>
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
                className={`rounded-xl border p-3 ${r.correct ? 'border-green-300 dark:border-green-900' : 'border-red-300 dark:border-red-900'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2">
                    <span aria-hidden="true">{r.correct ? '✓' : '✗'}</span>
                    <span className="font-semibold text-zinc-500">{i + 1}.</span>
                    {question && (
                      <div className="content prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: question.prompt }} />
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {t('quiz.pointsOf', { earned: r.pointsEarned, max: r.pointsMax })}
                  </span>
                </div>
                {!r.correct && question && <ExpectedAnswer result={r} question={question} />}
                {r.feedback && (
                  <div
                    className="content prose prose-sm mt-2 max-w-none text-zinc-600 dark:prose-invert dark:text-zinc-400"
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
